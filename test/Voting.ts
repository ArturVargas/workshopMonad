import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";

import { network } from "hardhat";

type PollTuple = readonly [
  `0x${string}`,
  string,
  string,
  bigint,
  bigint,
  bigint,
  boolean,
];
type OptionsTuple = readonly [readonly string[], readonly bigint[]];
type WinnerTuple = readonly [bigint, bigint, boolean];

const TITLE = "¿Almuerzo del viernes?";
const DESCRIPTION = "Elige una sola opción. El voto no se puede cambiar.";
const OPTIONS = ["Arepa", "Pizza", "Sushi"];
const ONE_HOUR = 60n * 60n;

describe("Voting", async function () {
  const { viem, networkHelpers } = await network.create();

  async function deployVoting() {
    const voting = await viem.deployContract("Voting");
    const [creator, alice, bob] = await viem.getWalletClients();
    return { voting, creator, alice, bob };
  }

  it("creates a poll and stores its options", async function () {
    const { voting, creator } = await networkHelpers.loadFixture(deployVoting);
    const publicClient = await viem.getPublicClient();
    const now = (await publicClient.getBlock()).timestamp;

    await viem.assertions.emitWithArgs(
      voting.write.createPoll([TITLE, DESCRIPTION, OPTIONS, ONE_HOUR], {
        account: creator.account,
      }),
      voting,
      "PollCreated",
      [
        0n,
        getAddress(creator.account.address),
        TITLE,
        (deadline: bigint) =>
          deadline === now + ONE_HOUR || deadline === now + ONE_HOUR + 1n,
      ],
    );

    const [creatorAddress, title, description, deadline, totalVotes, optionCount, open] =
      (await voting.read.getPoll([0n])) as PollTuple;
    assert.equal(getAddress(creatorAddress), getAddress(creator.account.address));
    assert.equal(title, TITLE);
    assert.equal(description, DESCRIPTION);
    assert.equal(deadline, now + ONE_HOUR + 1n);
    assert.equal(totalVotes, 0n);
    assert.equal(optionCount, 3n);
    assert.equal(open, true);

    const [labels, counts] = (await voting.read.getOptions([0n])) as OptionsTuple;
    assert.deepEqual(labels, OPTIONS);
    assert.deepEqual(counts, [0n, 0n, 0n]);
    assert.equal(await voting.read.pollCount(), 1n);
  });

  it("rejects an empty title, too few options, and duplicates", async function () {
    const { voting } = await networkHelpers.loadFixture(deployVoting);

    await viem.assertions.revertWithCustomError(
      voting.write.createPoll(["", DESCRIPTION, OPTIONS, ONE_HOUR]),
      voting,
      "EmptyTitle",
    );
    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.write.createPoll([TITLE, DESCRIPTION, ["Solo una"], ONE_HOUR]),
      voting,
      "InvalidOptionCount",
      [1n],
    );
    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.write.createPoll([TITLE, DESCRIPTION, ["Arepa", "Arepa"], ONE_HOUR]),
      voting,
      "DuplicateOption",
      [1n],
    );
  });

  it("counts one vote per address", async function () {
    const { voting, alice } = await networkHelpers.loadFixture(deployVoting);
    await voting.write.createPoll([TITLE, DESCRIPTION, OPTIONS, ONE_HOUR]);

    await viem.assertions.emitWithArgs(
      voting.write.vote([0n, 1n], { account: alice.account }),
      voting,
      "VoteCast",
      [0n, alice.account.address, 1n],
    );

    const [, counts] = (await voting.read.getOptions([0n])) as OptionsTuple;
    assert.deepEqual(counts, [0n, 1n, 0n]);
    const [, , , , totalVotes] = (await voting.read.getPoll([0n])) as PollTuple;
    assert.equal(totalVotes, 1n);
    assert.equal(
      await voting.read.hasVoted([0n, alice.account.address]),
      true,
    );
    assert.equal(await voting.read.voteOf([0n, alice.account.address]), 1n);

    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.write.vote([0n, 0n], { account: alice.account }),
      voting,
      "AlreadyVoted",
      [alice.account.address],
    );
  });

  it("rejects unknown polls, invalid options, and votes after the deadline", async function () {
    const { voting, alice } = await networkHelpers.loadFixture(deployVoting);
    await voting.write.createPoll([TITLE, DESCRIPTION, OPTIONS, ONE_HOUR]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.write.vote([4n, 0n], { account: alice.account }),
      voting,
      "PollNotFound",
      [4n],
    );
    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.write.vote([0n, 9n], { account: alice.account }),
      voting,
      "InvalidOption",
      [9n],
    );

    await networkHelpers.time.increase(ONE_HOUR);
    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.write.vote([0n, 0n], { account: alice.account }),
      voting,
      "VotingClosed",
      [0n],
    );
  });

  it("reports a winner and flags a tie", async function () {
    const { voting, alice, bob } = await networkHelpers.loadFixture(deployVoting);
    await voting.write.createPoll([TITLE, DESCRIPTION, OPTIONS, ONE_HOUR]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      voting.read.winner([0n]),
      voting,
      "NoVotes",
      [0n],
    );

    await voting.write.vote([0n, 2n], { account: alice.account });
    await voting.write.vote([0n, 2n], { account: bob.account });

    const [optionIndex, voteCount, tiedResult] = (await voting.read.winner([
      0n,
    ])) as WinnerTuple;
    assert.equal(optionIndex, 2n);
    assert.equal(voteCount, 2n);
    assert.equal(tiedResult, false);

    const { voting: tiedVote, alice: voterA, bob: voterB } =
      await networkHelpers.loadFixture(deployVoting);
    await tiedVote.write.createPoll([TITLE, DESCRIPTION, OPTIONS, ONE_HOUR]);
    await tiedVote.write.vote([0n, 0n], { account: voterA.account });
    await tiedVote.write.vote([0n, 1n], { account: voterB.account });

    const [tiedIndex, tiedVotes, isTied] = (await tiedVote.read.winner([
      0n,
    ])) as WinnerTuple;
    assert.equal(tiedIndex, 0n);
    assert.equal(tiedVotes, 1n);
    assert.equal(isTied, true);
  });
});
