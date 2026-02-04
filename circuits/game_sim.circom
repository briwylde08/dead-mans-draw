pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/// Extract card type from card number (0-24).
/// Types: 0=Triangle (0-7), 1=Square (8-15), 2=Line (16-23), 3=BlackSpot (24)
/// Formula: type = (1-lt8) + (1-lt16) + (1-lt24)
template CardType() {
    signal input card;
    signal output card_type;

    component lt8 = LessThan(5);
    lt8.in[0] <== card;
    lt8.in[1] <== 8;

    component lt16 = LessThan(5);
    lt16.in[0] <== card;
    lt16.in[1] <== 16;

    component lt24 = LessThan(5);
    lt24.in[0] <== card;
    lt24.in[1] <== 24;

    card_type <== (1 - lt8.out) + (1 - lt16.out) + (1 - lt24.out);
}

/// Simulate one round of the pirate card game.
/// Returns updated state (scores, game_active, winner).
template GameRound() {
    // Card inputs
    signal input card_p1;
    signal input card_p2;

    // State inputs
    signal input score_p1_in;
    signal input score_p2_in;
    signal input game_active_in; // 1 if game still running, 0 if over
    signal input winner_in;      // 0=undecided, 1=P1, 2=P2

    // State outputs
    signal output score_p1_out;
    signal output score_p2_out;
    signal output game_active_out;
    signal output winner_out;

    // --- Get card types ---
    component ct1 = CardType();
    ct1.card <== card_p1;
    component ct2 = CardType();
    ct2.card <== card_p2;

    signal type_p1 <== ct1.card_type;
    signal type_p2 <== ct2.card_type;

    // --- Black spot detection ---
    component bs1 = IsEqual();
    bs1.in[0] <== type_p1;
    bs1.in[1] <== 3;
    component bs2 = IsEqual();
    bs2.in[0] <== type_p2;
    bs2.in[1] <== 3;

    signal is_bs_p1 <== bs1.out;
    signal is_bs_p2 <== bs2.out;
    // OR gate: any_bs = a + b - a*b
    signal bs_product <== is_bs_p1 * is_bs_p2;
    signal any_bs <== is_bs_p1 + is_bs_p2 - bs_product;

    // --- RPS comparison (only valid when no black spot) ---
    // combined = type_p1 * 3 + type_p2
    // P1 wins: combined in {1, 5, 6} → (Tri>Sq), (Sq>Line), (Line>Tri)
    // P2 wins: combined in {2, 3, 7}
    // Tie:     combined in {0, 4, 8}
    signal combined <== type_p1 * 3 + type_p2;

    component eq1 = IsEqual(); eq1.in[0] <== combined; eq1.in[1] <== 1;
    component eq5 = IsEqual(); eq5.in[0] <== combined; eq5.in[1] <== 5;
    component eq6 = IsEqual(); eq6.in[0] <== combined; eq6.in[1] <== 6;

    component eq0 = IsEqual(); eq0.in[0] <== combined; eq0.in[1] <== 0;
    component eq4 = IsEqual(); eq4.in[0] <== combined; eq4.in[1] <== 4;
    component eq8 = IsEqual(); eq8.in[0] <== combined; eq8.in[1] <== 8;

    signal p1_wins_rps <== eq1.out + eq5.out + eq6.out;
    signal is_tie <== eq0.out + eq4.out + eq8.out;

    // --- Score updates (only if game active and no black spot) ---
    signal no_bs <== 1 - any_bs;
    signal active_no_bs <== game_active_in * no_bs;
    signal delta_p1 <== p1_wins_rps * active_no_bs;

    // p2_wins_rps = 1 - p1_wins_rps - is_tie (when no BS)
    signal p2_wins_rps <== 1 - p1_wins_rps - is_tie;
    signal delta_p2 <== p2_wins_rps * active_no_bs;

    score_p1_out <== score_p1_in + delta_p1;
    score_p2_out <== score_p2_in + delta_p2;

    // --- Check for 3 wins ---
    component ge3_p1 = GreaterEqThan(4);
    ge3_p1.in[0] <== score_p1_out;
    ge3_p1.in[1] <== 3;

    component ge3_p2 = GreaterEqThan(4);
    ge3_p2.in[0] <== score_p2_out;
    ge3_p2.in[1] <== 3;

    // --- Determine round winner (if game was active) ---
    // Priority: black spot > reaching 3 wins
    // BS: if P1 draws BS, P2 wins (2); if P2 draws BS, P1 wins (1)
    // If both draw BS: can't happen (only 1 in deck), but circuit handles it as 0

    // winner_not_yet_set = (winner_in == 0) ? 1 : 0
    component wz = IsEqual();
    wz.in[0] <== winner_in;
    wz.in[1] <== 0;
    signal winner_not_set <== wz.out;

    signal can_set_winner <== game_active_in * winner_not_set;

    // Black spot winner: P1 draws BS → 2, P2 draws BS → 1
    signal bs_winner_code <== is_bs_p1 * 2 + is_bs_p2 * 1 - bs_product * 3;
    signal bs_sets_winner <== can_set_winner * any_bs;
    signal bs_contribution <== bs_sets_winner * bs_winner_code;

    // Score-3 winner (only if no BS triggered)
    signal no_bs_can_set <== can_set_winner * no_bs;
    signal score3_p1 <== ge3_p1.out * no_bs_can_set;
    signal score3_p2_temp <== ge3_p2.out * no_bs_can_set;
    // P1 reaching 3 takes priority over P2 (if both reach 3 same round)
    signal score3_p2 <== score3_p2_temp * (1 - ge3_p1.out);

    signal score_contribution <== score3_p1 * 1 + score3_p2 * 2;

    winner_out <== winner_in + bs_contribution + score_contribution;

    // --- Update game_active ---
    // Game ends if winner was set this round
    component round_ended = IsZero();
    round_ended.in <== bs_contribution + score_contribution;
    signal still_active <== round_ended.out; // 1 if nothing ended this round

    game_active_out <== game_active_in * still_active;
}

/// Full game simulation over nRounds rounds with tiebreaker.
/// nCards should be 25 (12 rounds + 1 leftover card).
template GameSim(nCards) {
    var nRounds = (nCards - 1) / 2; // 12 rounds from 25 cards

    signal input deck[nCards];
    signal input combined_seed; // for coin flip tiebreaker

    signal output winner; // 1 = P1, 2 = P2

    // Chain game rounds
    component rounds[nRounds];

    signal scores_p1[nRounds + 1];
    signal scores_p2[nRounds + 1];
    signal active[nRounds + 1];
    signal winners[nRounds + 1];

    scores_p1[0] <== 0;
    scores_p2[0] <== 0;
    active[0] <== 1;
    winners[0] <== 0;

    for (var i = 0; i < nRounds; i++) {
        rounds[i] = GameRound();
        rounds[i].card_p1 <== deck[2 * i];
        rounds[i].card_p2 <== deck[2 * i + 1];
        rounds[i].score_p1_in <== scores_p1[i];
        rounds[i].score_p2_in <== scores_p2[i];
        rounds[i].game_active_in <== active[i];
        rounds[i].winner_in <== winners[i];

        scores_p1[i + 1] <== rounds[i].score_p1_out;
        scores_p2[i + 1] <== rounds[i].score_p2_out;
        active[i + 1] <== rounds[i].game_active_out;
        winners[i + 1] <== rounds[i].winner_out;
    }

    // --- Deck exhaustion tiebreaker ---
    // If game is still active after all rounds:
    //   - Most wins takes it
    //   - True tie: deterministic coin flip using Poseidon(cs, 25) LSB

    signal final_winner <== winners[nRounds];
    signal final_active <== active[nRounds];
    signal final_s1 <== scores_p1[nRounds];
    signal final_s2 <== scores_p2[nRounds];

    // Compare final scores (only matters if game still active)
    component s1_gt_s2 = GreaterThan(4);
    s1_gt_s2.in[0] <== final_s1;
    s1_gt_s2.in[1] <== final_s2;

    component s2_gt_s1 = GreaterThan(4);
    s2_gt_s1.in[0] <== final_s2;
    s2_gt_s1.in[1] <== final_s1;

    component scores_equal = IsEqual();
    scores_equal.in[0] <== final_s1;
    scores_equal.in[1] <== final_s2;

    // Coin flip: Poseidon(cs, 25) LSB → 0 means P1, 1 means P2
    component coin = Poseidon(2);
    coin.inputs[0] <== combined_seed;
    coin.inputs[1] <== nCards; // 25

    component coin_bits = Num2Bits(254);
    coin_bits.in <== coin.out;
    signal coin_lsb <== coin_bits.out[0]; // 0 or 1

    // Coin winner: 1 (P1) if LSB=0, 2 (P2) if LSB=1
    signal coin_winner <== 1 + coin_lsb;

    // Tiebreaker winner determination
    signal tb_p1_wins <== s1_gt_s2.out * final_active;
    signal tb_p2_wins <== s2_gt_s1.out * final_active;
    signal tb_tie <== scores_equal.out * final_active;

    signal tiebreak_winner <== tb_p1_wins * 1 + tb_p2_wins * 2 + tb_tie * coin_winner;

    // Final winner: either from rounds or from tiebreaker
    winner <== final_winner + tiebreak_winner;
}
