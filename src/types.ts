export interface Challenge {
  openForSubmissions: boolean;
  expiredForRewarding: boolean;
  assertionId: bigint;
  assertionStateRootOrConfirmData: string;
  assertionTimestamp: bigint;
  challengerSignedHash: string;
  activeChallengerPublicKey: string;
  rollupUsed: string;
  createdTimestamp: bigint;
  totalSupplyOfNodesAtChallengeStart: bigint;
  rewardAmountForClaimers: bigint;
  amountForGasSubsidy: bigint;
  numberOfEligibleClaimers: bigint;
  amountClaimedByClaimers: bigint;
}