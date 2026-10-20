---
title: Consistency
description: How nodes agree, from linearizable reads and CAP to clocks, consensus, Raft, two-phase commit, and sagas.
---

Every design that keeps data on several nodes must decide what a read may return and how the nodes settle on one answer. To defend it, say what each operation must see and how the nodes agree, how a change across nodes finishes safely, and what each guarantee costs.

## Acting as one copy

A wallet app keeps balances on one leader with followers in other zones. Anna sends Ben $50. The transfer commits on the leader, and a notification service pushes "Anna sent you $50" to Ben's phone. Ben opens the app. His balance comes from a follower that has not applied the transfer yet, and the money is not there.

::diagram{name="stale-after-push"}

[Read-your-writes](../replication/#seeing-your-own-writes) does not help: the write is Anna's, and Ben reads because a signal reached him by another path. Ben needs a store that acts as if each record had only one copy.

**Linearizability** gives that. All reads and writes fit one order, as if they ran one at a time on a single copy, and each takes effect at some moment between its request and its answer. So once a write has finished, a read that starts later returns that value or a newer one, whichever copy it reaches. Reads that overlap the write may return the old value or the new one, but once a read has returned the new value, a read that starts after it cannot return the old one, unless another write has set it back. Some product docs call this strong consistency; check what exactly they promise.

::diagram{name="linearizable-reads"}

It costs coordination between nodes, so ask for it only where an old answer does harm:

- A read that follows a signal about a write: a push, a queue message with a record ID, a link to a file that was just uploaded. The receiver reads at once, from whatever copy it reaches.
- A check that guards a rule: a balance that must not go below zero, a handle that only one user may take. A fresh read alone is not enough here, since two requests can both read "enough money" before either writes. Make the check and the change one atomic operation, such as a conditional write or compare-and-set, or a transaction at a fitting isolation level (more on [checking, then writing](../transactions/#checking-then-writing)). If that operation is linearizable, it works on a state that includes every write that finished before it.
- Deciding who acts: a lock, or the choice of a leader. As with a rule, "read that it is free, then take it" must be one conditional operation.

A history view or a like count may lag by a second if users can live with that.

One node can give linearizable operations, though reads from an old snapshot or from a cache in front of it still return older data. Among the setups from replication, one leader gives them when reads and writes go to it, failover keeps every confirmed write, and the leader confirms that it still leads before it answers: a leader cut off from the others may not know that it was replaced. A follower gives them only when it first learns from the current leader which writes have finished and waits until it has applied them. Independent leaders cannot, since each can accept a write before the others learn about it. Leaderless quorums cannot either, even with W + R > N: a write that reached only some replicas can show up in one read and be missing from a later one (more on [quorums](../replication/#writing-without-a-leader)).

::diagram{name="linearizable-setups"}

:::distinguish
Here "consistency" means what a read may return when data has several copies. In transactions, the same word means that data follows its rules (more on [consistency in transactions](../transactions/#a-rule-across-several-rows)). Serializable isolation is also something else: transactions act as if they ran one after another, but their order need not match real time, so serializable alone does not promise fresh reads. Linearizability is about each record and real time: a read returns a value at least as new as every write that finished before the read began.
:::

:::do
Use linearizable reads where a read follows a signal about a write. Use atomic conditional writes or a fitting transaction where a check guards a rule or decides who acts. Serve other reads from the nearest copy that meets their own guarantee.
:::

Keeping one order of operations across copies needs the copies to reach each other.

## Answering during a network partition

The wallet now serves users in the US too. The leader stays in Europe, and the US region has followers. The link between the regions goes down for ten minutes. A user in New York sends $20, and the US nodes cannot reach the leader.

A break that splits nodes into groups that cannot reach each other is a **network partition**. The US side has two options: refuse the transfer until the link is back, or accept it on a local copy and reconcile later, when the same money may already have been spent in Europe. A node cannot promise the latest value when it cannot reach the node that decides it.

::diagram{name="partition-choice"}

**CAP** states this as a theorem: during a network partition, a system with copies cannot both stay linearizable and complete every request on every node that has not failed. C stands for linearizability. A stands for availability in a narrow sense: every request to a working node eventually completes as the operation defines it. A correct "not enough money" counts; an "unavailable" error or a made-up refusal does not. A is not an uptime percentage, and it sets no time limit. P stands for partition tolerance, and a design cannot drop it, because networks do break. So the popular "pick two of three" is misleading: the choice is between C and A, and only while the network is split.

A node sees a partition only as a timeout: it cannot tell a broken link from a slow one. A node that keeps waiting for the other side chooses consistency, and a node that gives up and answers from its own copy chooses availability. Nodes may also disagree on whether a partition is happening at all.

The choice can differ per operation, so make it for each one:

- Transfers on the side without the leader: refuse them. Users see an error, and that side accepts no transfers that conflict with Europe's.
- Balances and history: answer from the local copy and show that it may be behind. Stale reads leave nothing to merge later.
- Small payments: accept them up to a limit and settle after the partition, the way an ATM [keeps working offline](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/). This works only when the loss is capped and a later fix, such as a fee, is acceptable. A stricter variant gives each side its own share in advance, such as a spending limit per region, so neither side can break the rule.
- Card top-ups on the side without the leader: keep them pending and do not charge the card, because this side cannot record the top-up where every region will see it. The side with the leader keeps charging.

When both sides accept writes that conflict, the copies must merge them after the partition, and the system must repair any rule that the merge broke (more on [resolving conflicting writes](../replication/#resolving-conflicting-writes)). Accepting writes on both sides means listing those rules and how to repair each one.

:::tradeoff
Refusing writes during a partition avoids conflicting writes but turns a network problem into errors for users. Accepting them keeps users working but needs a merge and a repair for every rule that conflicting writes can break.
:::

:::avoid
Calling a whole database "CP" or "AP". Behavior depends on its settings and on each operation: the same store can refuse writes on the minority side and still serve stale reads there. Say what each operation does during a partition.
:::

## Paying for consistency without failures

There is no partition, but in this setup every transfer from New York still goes to the leader in Europe and waits for its answer: a round trip across the ocean on every write. Reads that must be linearizable go there too.

::diagram{name="write-round-trip"}

**PACELC** adds this to CAP: if there is a Partition, a system trades Availability against Consistency; Else, it trades Latency against Consistency. The second trade-off is the one a system meets every day. Keeping one order of operations means that some nodes must hear from others before they answer, and that wait adds to the latency. A design can move the wait, for example off each read, but cannot remove it. In [his 2012 paper](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf), Daniel Abadi put Dynamo-style stores such as Cassandra, in their default setup, in PA/EL: they give up consistency in both cases. VoltDB was PC/EC: it pays for consistency in both.

Between "one copy" and "any copy" lie guarantees that cost less. Azure Cosmos DB offers five of them as [settings](https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels), from strongest to weakest:

- Strong: linearizable. Across regions, a write waits until the regions it must reach have confirmed it.
- **Bounded staleness**: a read may be behind, but by no more than a set number of versions or seconds.
- Session: read-your-writes and writes follow reads within one client's session.
- Consistent prefix: reads see writes in order, perhaps late (more on [consistent prefix reads](../replication/#seeing-writes-in-order)). In Cosmos DB, this order holds for writes made together in one transaction.
- Eventual: copies [converge](../replication/#reading-from-a-copy-that-is-behind) when writes stop, with no promise in between.

::diagram{name="consistency-levels"}

Its docs name session as the most widely used level. Its guarantees hold within one logical partition, and the docs list further limits for each level.

In the wallet, transfers pay the round trip, because the conditional debit must see every earlier transfer. Ben's balance after the push must include Anna's transfer, which read-your-writes does not cover. So the notification carries a token for the transfer, such as the log position that the database returned at commit, and the balance read on the nearest copy waits until that copy has applied the log up to it. A balance opened without such a signal comes from the nearest copy and shows when it was last updated. History and notifications use a weaker guarantee.

::diagram{name="token-read"}

:::do
Pay for linearizability only on the operations that need it, and give the others the weakest guarantee that users will not notice. Put the leader, or the majority of copies that confirms a write, close to most of the writers.
:::

## Keeping cause before effect

History and notifications are now served from each user's own region. Anna, in Europe, asks Ben to pay her back $30 for dinner. Ben, in the US, gets a push about the request and pays at once. The payment is written in the US before the request has replicated there, so a friend of Ben's in the US sees "Ben paid Anna $30" without the request it answers.

A read from one log, at one point in it, sees the writes of that log in order. The problem appears when writes travel by different paths, as with several logs or several regions that accept writes. Ben's payment depends on the request: he saw it before he paid. A write depends on the client's earlier operations and on the writes the client had read, and through them on everything those depended on. Two writes where neither depends on the other are [concurrent](../replication/#resolving-conflicting-writes).

**Causal consistency** guarantees that every node shows writes that depend on each other in the order they happened. Concurrent writes may show up in different orders on different nodes. It includes the guarantees a user gets for their own writes, such as [read-your-writes and writes follow reads](../replication/#seeing-writes-in-order), and extends them to writes that one user made after seeing another user's write.

A common way to provide it: each client keeps the versions it has read and written, including those that came with a push, and sends them with every later read and write. A copy serves the read only when it already has all of them, and a region shows a received write only after everything it depends on has arrived. The costs are extra data on every write and a delay until the dependencies arrive, which can last as long as a partition. When a region confirms writes before they reach other regions, losing that region loses confirmed writes.

::diagram{name="causal-order"}

Causal consistency can keep working during a network partition for a client that stays with a copy that already has everything the client saw. A client that moves to a copy without those writes must wait or go back. **Sequential consistency** is stronger: all operations fit one order that keeps each client's own order, but that order need not follow real time between clients. After Anna's write has finished, Ben may still read the old value, though he never goes back from a value he has seen. Like linearizability, it makes some nodes refuse requests during a partition.

::diagram{name="sequential-vs-linearizable"}

[Jepsen's map](https://jepsen.io/consistency/models) shows which guarantees can, in theory, keep working during a network partition:

| Guarantee | What a read may return | In theory, during a network partition |
|---|---|---|
| Linearizable | a value from one order of all operations that matches real time | some nodes must refuse |
| Sequential | a state from one order of all operations that keeps each client's order | some nodes must refuse |
| Causal | writes that depend on each other in order | works for a client that stays with a copy holding its past |
| Read-your-writes | at least the client's own writes | works for a client that stays with one copy |
| Monotonic reads | nothing older than the client saw before | works on every node |
| Eventual | any version, converging when writes stop | works on every node |

:::do
Use causal consistency for data that people react to, such as messages, comments, and requests, when it is served from several regions. Keep linearizability and atomic conditional writes for checks and decisions.
:::

## Clocks that disagree

The history page sorts transfers by the time each server wrote them. Anna gets a refund for a payment. The payment was written on a server whose clock runs 200 ms ahead, and the refund on a server with a correct clock 100 ms later, so the history shows the refund before the payment.

::diagram{name="skewed-timestamps"}

Operating systems give two kinds of clock:

- A **time-of-day clock** returns the date and time. A sync service such as NTP, the Network Time Protocol, corrects it against servers with better clocks, and a correction can move it forward or back. It also jumps after a pause of the virtual machine, a manual change, or a leap second.
- A **monotonic clock** only moves forward. It measures how much time has passed on one machine, such as a timeout. Its values mean nothing on another machine.

::diagram{name="two-clocks"}

Time-of-day clocks on different machines are not guaranteed to agree. **Clock skew** is the difference between their readings at one moment, and **clock drift** is the difference in how fast they run, which makes the clock skew grow between syncs. At an assumed drift of 200 parts per million, a clock can gain or lose 6 ms in 30 seconds, or about 17 seconds a day without syncing. NTP often keeps clocks within a millisecond or so on a quiet local network and within tens of milliseconds over the internet, but these are typical values, not guarantees. An ordinary clock reading does not come with a reliable error bound.

::diagram{name="skew-and-drift"}

A time-of-day clock that goes back breaks code that measures durations with it. On January 1, 2017, a leap second moved the clock back, and Cloudflare's DNS servers [computed a negative duration](https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/). The code that chose an upstream server crashed on it, and about 0.2% of DNS queries failed at the peak.

Timestamps from time-of-day clocks cannot order events that are closer together than the clocks' error. Two errors follow:

- A later event sorted before an earlier one, as with the refund.
- [Last write wins](../replication/#resolving-conflicting-writes) keeping the wrong write: a node with a clock that runs behind cannot overwrite a value from a node whose clock runs ahead, and its writes are dropped without an error.

::diagram{name="lww-drop"}

:::do
Measure timeouts and durations with a monotonic clock. Do not order events from different nodes by their time-of-day timestamps alone. Monitor clock skew and take a node out of service when its clock drifts too far.
:::

When the clocks cannot order events, the order must come from the events themselves.

## Ordering events by cause

The refund service records the refund only after it has received the payment. That message gives an order that no clock error can break.

Within one process that does one thing at a time, events have an order. Between processes, one event comes before another only through messages. **Happens-before** is that order: A happens before B if A is earlier in the same process, if A is the sending and B the receiving of one message, or if a chain of such steps connects them. When neither happens before the other, the events are concurrent, whatever the clocks say.

::diagram{name="happens-before"}

A **Lamport clock** gives every event a number that respects happens-before:

1. Each process keeps a counter and adds one for each event, sending included.
2. Every message carries the sender's counter.
3. On receiving a message, a process sets its counter to the larger of its own and the received one, plus one.

If A happens before B, A gets a smaller number. Concurrent events may get the same number, so the pair (counter, process ID) breaks ties and gives all events one sort order that every process computes the same way. In the wallet, the refund is written after its server has received the payment, so the refund gets a larger number and sorts after the payment, whatever the clocks show.

::diagram{name="lamport-clock"}

If A happens before B, A's number is smaller, but a smaller number alone does not prove that A happened before B. To tell concurrent events apart, a **vector clock** keeps one counter per process:

- A process adds one to its own counter for each event and sends the whole vector with each message.
- A receiver takes the larger value of each counter, then adds one to its own.

Vector A comes before B when no counter of A is larger than B's and at least one is smaller. When each has a counter larger than the other's, the events are concurrent. With two processes, [2, 0] and [1, 1] are concurrent, and [3, 2] comes after both. It is the same idea as a [version vector](../replication/#resolving-conflicting-writes) per record, and it costs a counter per process in every message.

::diagram{name="vector-clock"}

| | Lamport clock | Vector clock |
|---|---|---|
| Size | one counter | one counter per process |
| A happens before B | A's number is smaller | no counter of A is larger, and one is smaller |
| A and B are concurrent | not detected | detected |
| Use for | one sort order of known events, such as a log merged from several nodes | finding writes that conflict, to merge them |

Logical clocks order the events that a node already knows about. Anna and another user in the US claim the handle @anna at the same moment, and their requests get the numbers 41 and 42. The region that holds 42 cannot say "yours": a node it cannot reach may hold 41. Sorting the requests it knows does not prove that no earlier request is missing.

## Agreeing on one value

Both regions must give one answer for @anna: one user gets it, the other gets "taken", and the answer must not change, even if a node crashes right after answering.

**Consensus** is that agreement. Several nodes propose values and decide on one: no two nodes decide differently, a decision never changes, and the decided value is one that some node proposed. Every node that keeps working eventually decides, under the conditions below. The first three rules are safety: nothing contradictory is ever decided. The last is liveness: a decision eventually comes.

The algorithms in use assume that nodes may crash but do not lie, and they decide by majority. Any two majorities of the same group share at least one node. The protocol keeps durable votes and logs on every node, so a later majority always learns about an earlier decision and cannot replace it. To keep working after F nodes crash, a group needs at least 2F + 1 voting nodes: 3 survive one crash, and 5 survive two. A group of 4 also survives only one, so groups usually have an odd size. Majorities overlap only within one set of voting nodes, so add or remove voters only through the store's own procedure for it.

::diagram{name="majority-overlap"}

::diagram{name="group-sizes"}

During a network partition, the side with a majority keeps deciding, and the side without one stops: a majority protocol makes the CAP choice for consistency. For one decision, the group never chooses two values, but it can stop deciding while it cannot form a majority.

A deterministic algorithm cannot promise to finish in a network where messages can take any time, even if only one node may crash. Real algorithms keep decisions safe at all times, and they make progress once messages arrive in time for long enough to keep a stable leader. A wrong timeout delays a decision but never makes the group decide twice.

Consensus can implement a value written once, a compare-and-set, and a log of commands that every node appends in the same order. Other systems build locks and leader election for apps on these decisions. In **state machine replication**, every replica applies the same deterministic commands in the same order from the same state, so all of them reach the same state. Anything that could differ between replicas, such as a timestamp or a random ID, is chosen once and stored in the command. The wallet's ledger can be such a log: every replica applies the same transfers in the same order and ends with the same balances.

::diagram{name="state-machine-replication"}

Raft, Multi-Paxos, and ZAB give a design the same thing: a log agreed by a majority, with at most one leader that can commit at a time. [etcd](https://github.com/etcd-io/raft) and [CockroachDB](https://www.cockroachlabs.com/docs/stable/architecture/replication-layer) use Raft, [Spanner](https://research.google/pubs/spanner-googles-globally-distributed-database-2/) uses Paxos, and [ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperInternals.html) uses ZAB, ZooKeeper Atomic Broadcast.

:::do
Use consensus for decisions that must be unique and must stay made: who holds a name, a lock, or the leader role, and what order the writes come in. Run it on 3 or 5 voting nodes in different zones, from a proven store, not your own code.
:::

## Choosing a leader everyone accepts

The wallet moves the data that needs one order, the ledger and the handles, to a group of three nodes that run Raft. History and requests still replicate as before. One node of the group is the leader: it orders the writes, and the others follow. When the leader fails, the other two must pick a new one, and only one.

Raft numbers its leaders by **term**: each election starts a new term, and a term has at most one leader. An election goes like this:

1. A follower that has heard nothing from the leader for its **election timeout** becomes a candidate. It starts a new term, votes for itself, and asks the others for votes. Each node picks its timeout at random from a range, again for each election. The Raft paper uses 150 to 300 ms as an example for one data center; production systems set the range from measured delays.
2. Each node votes once per term, and saves its vote to disk before it answers, so a restart cannot make it vote twice. It votes for the first candidate that asks, unless that candidate's log is behind its own: a log is behind when its last entry has an older term, or the same term and a lower position.
3. A candidate with votes from a majority becomes the leader of the term and sends heartbeats so that the others stay followers. When two candidates split the votes, nobody wins, and a new term starts after another random timeout. The random timeouts make a repeat unlikely.

::diagram{name="raft-election"}

The vote rule keeps finished writes. A write finishes only once a majority has saved it, and a winner needs votes from a majority. Every voter refuses a candidate whose log is behind its own, and together with the rules for appending to the log, this makes every new leader hold every finished write.

::diagram{name="vote-keeps-writes"}

The term also stops an old leader. A leader that was paused or cut off may still believe it leads. Every message carries its term, and nodes reject messages with an older term, so when the old leader contacts a node that knows a newer term, it learns the term and steps down. This is [fencing](../replication/#replacing-a-failed-leader) built into the protocol.

::diagram{name="old-leader-steps-down"}

Simpler schemes, such as "the node with the highest ID that you can reach is the leader", elect one leader on each side of a network partition: split brain. Majority votes avoid it, because only one side can have a majority.

::diagram{name="split-brain-majority"}

While there is no leader, the group accepts no writes. A simple failover takes about one election timeout plus the election, and split votes or partial failures make it longer. The timeout must be well above the normal round trip between the nodes, or slow messages start needless elections, and well below the time between failures. In 2020, a Cloudflare switch [stopped forwarding some traffic](https://blog.cloudflare.com/a-byzantine-failure-in-the-real-world/) while other paths still worked: one etcd node lost its link to the leader but could still reach the third node. It kept starting elections that it could not win, and the group refused writes until the switch recovered, about six minutes later. Raft implementations such as [etcd's](https://github.com/etcd-io/raft) offer a pre-vote step against such cases: a node first asks whether it could win and starts a new term only if a majority would vote for it.

::diagram{name="pre-vote"}

:::do
Run 3 or 5 voting nodes in different zones. Set the election timeout from measured round trips and disk delays. Expect writes to pause for about an election timeout plus the election when a leader fails, and longer after split votes.
:::

## Committing through a majority

Anna sends Ben $50, and the transfer goes to the Raft leader. The leader must make it durable on a majority before it tells Anna that the money is sent.

The leader appends the transfer to its log and sends it to the followers; the same message serves as the heartbeat. Each follower saves the entry and answers. Once a majority, the leader included, has saved an entry from the leader's current term, that entry and every entry before it are committed: every future leader will have them. The leader applies the transfer to the balances, answers Anna, and tells the followers in its next message how far the log is committed, so they apply it too.

::diagram{name="raft-commit"}

An older entry that a new leader finds on a majority is not committed by that alone. It becomes committed when an entry of the new leader's own term is committed after it, which is why a new leader starts by committing an empty entry.

::diagram{name="current-term-commit"}

An entry that only a failed leader had saved is not committed and may disappear: the new leader does not have it, and Anna never got an answer for it. Each message from the leader names the position and term of the entry before the new ones. A follower whose log does not match there refuses, and the leader retries from an earlier position. Where an incoming entry conflicts with a follower's entry, the follower drops that entry and everything after it, then appends the leader's entries.

::diagram{name="log-repair"}

The leader may also commit the transfer and fail before it answers. Anna's app retries with the new leader, and without a check the money moves twice. The fix is an idempotency key stored in the log with the transfer: a repeat with the same key gets the first answer.

::diagram{name="retry-with-key"}

Reads need care too. A follower may be behind, and a leader may have been replaced without knowing it. Raft gives linearizable reads in two ways:

- A read barrier, called ReadIndex in some implementations. The leader notes how far the log is committed, confirms with a heartbeat to a majority that it still leads, waits until it has applied the log up to that point, then answers. This costs a round trip, but no disk write. A follower can serve such a read too: it gets that point from the leader, which confirms its role first, and waits until it has applied the log up to there.
- A **lease**: a right that lasts a set time. The followers that answer a heartbeat will not start an election until their election timeout runs out, so no other leader can appear during that time, and the leader answers reads without the round trip. Each heartbeat that a majority answers renews the lease; when renewals stop, the leader stops answering reads on its own. This is safe only when the implementation limits how fast clocks may drift, makes a new leader wait until the old lease has run out, and keeps a paused leader from using a lease that has already run out.

::diagram{name="read-barrier-vs-lease"}

::diagram{name="follower-read"}

Every write pays a round trip to the nearest majority and a disk write on each of those nodes. With the three nodes in three zones of one region, the round trip is short. With one voting node in each of three regions, any two regions form a majority: losing one region loses no committed write, and every write waits for the nearest other region. With voting nodes in only two regions, the region that holds the majority stays writable when the link breaks, and the other cannot write.

::diagram{name="voter-placement"}

:::do
Give every client request an idempotency key. Use the read barrier where a stale answer does harm, lease reads only where the implementation enforces their timing rules, and plain follower reads where a stale answer is fine.
:::

## Letting only one node act

Each night the wallet sends payouts to banks. The job runs on three machines in case one fails, but only one of them may send. The map of which shard holds which accounts must also exist in one version that every router trusts (more on [finding the shard for a request](../sharding/#finding-the-shard-for-a-request)).

Both can share a **coordination service**: a small consensus group, such as etcd, ZooKeeper, or Consul, that other systems use for such decisions. It stores small keys with linearizable writes and compare-and-set, and adds:

- Leases for clients. A client renews its session with heartbeats, and when the renewals stop, the service deletes the keys tied to the session. A lock is such a key: the first client to create it holds the lock, and when the holder dies, the key expires and another client takes over. Electing a leader for an app works the same way.
- Watches: a client is told when a key changes, instead of polling.
- A number that grows with every change: the [revision](https://etcd.io/docs/v3.6/learning/api_guarantees/) in etcd, the transaction ID, or [zxid](https://zookeeper.apache.org/doc/current/zookeeperInternals.html), in ZooKeeper.

::diagram{name="coordination-service"}

A lease does not stop a holder that pauses. The payout job stops for a long garbage collection, its lease runs out, a second machine takes the lock and starts sending, and then the first one wakes up and sends too. The growing number solves this. Each grant has a **fencing token**: the number of the change that granted the lock, which is larger for every later grant. The bank or database that receives the work durably keeps the largest token it has accepted and, in the same atomic operation as the change, rejects any older one. This stops a stale holder at a receiver that has already seen a newer token; it does not stop the stale process itself.

::diagram{name="fencing-token"}

A bank's API cannot check tokens. For a fixed payout, a payout ID helps instead: the bank processes each ID once, if its API promises that and says for how long it remembers the IDs. That protects the payout itself. Other work that a stale holder might do still needs a token check or a conditional write at the receiver.

A lock has one of two purposes, and they need different tools. A lock for efficiency stops two machines from doing the same work, and a rare double run only costs time, so a single Redis key with an expiry is enough. <!-- link: patterns/distributed-locks --> A lock for correctness keeps data right, and a double holder corrupts it. It needs a consensus store and a fencing token checked by the receiver, as Martin Kleppmann [explains](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html).

Use a coordination service for small, shared metadata, such as locks, leaders, configuration, and shard maps. Keep the wallet's balances in a database that spreads them over many consensus groups. Reads from a coordination service are not always linearizable: etcd's are [by default](https://etcd.io/docs/v3.6/learning/api_guarantees/), but a ZooKeeper server answers reads from its own copy, which may be behind, and a sync before a read does not [guarantee a fresh value](https://zookeeper.apache.org/doc/current/zookeeperInternals.html) in every failure. Clients that only need to find services can cache what they read and accept data a moment old.

:::avoid
Do not rely on a lock with an expiry alone where two holders would corrupt data. A paused holder can act after its lock has passed to another. Check a fencing token where the work lands, or, for a fixed piece of work, use an ID that the receiver processes only once.
:::

## Committing on several nodes

The wallet outgrows one group and shards accounts by account ID, each shard a Raft group of its own. Anna's account is on shard 1 and Ben's on shard 7. So far the wallet runs transactions inside one shard only, so the transfer becomes two writes, and a process that stops between them loses $50 or creates it.

::diagram{name="two-writes"}

Keeping the rows that change together on one shard is the [first fix](../sharding/#writing-to-several-shards), but transfers go between any two users. The debit and the credit must both commit or both abort. This is **atomic commit**.

**Two-phase commit** provides it. One node is the coordinator, and the shards that hold the rows are participants:

1. Prepare. The coordinator asks each participant to prepare. A participant saves its changes to disk with enough state to finish them after a crash, and votes yes. A yes vote is a promise to follow the final decision: the participant can no longer abort on its own. A participant that cannot make the change votes no.
2. Commit. If every vote is yes, the coordinator writes "commit" to its own log, and from that moment the transaction is committed. Then it tells every participant, and each one commits and releases its locks. One no, or a participant that does not answer in time, makes the coordinator write "abort" and tell everyone.

::diagram{name="two-phase-commit"}

::diagram{name="tpc-abort"}

The weak spot is the coordinator. A participant that voted yes must wait for the decision and keeps its changes locked while it waits. If the coordinator fails after the votes and before the decision reaches everyone, the participants are **in doubt** until they learn the decision, usually from the coordinator once it recovers. A participant that aborts on its own after a timeout can break atomicity, since the coordinator may have decided to commit and told the others. Three-phase commit tries to remove the wait, but it is safe only when message delays are bounded: during a network partition, one side may commit while the other aborts. It is rarely used.

::diagram{name="in-doubt"}

Distributed databases such as Spanner and CockroachDB keep the decision and each participant's prepared state in consensus groups, so the loss of one node loses neither, and another node carries on. A transaction can still wait when a group it needs has lost its majority.

::diagram{name="tpc-on-consensus"}

Basic two-phase commit still costs, though databases overlap or shorten some of its steps:

- A round to prepare and a round to commit, with durable writes on every participant, and the slowest participant sets the pace.
- Prepared changes stay locked across both rounds, so a busy row waits for the slowest node.
- Every participant must support prepare. The XA standard runs two-phase commit across different products, such as a database and a message broker, but recovery must then handle the failures of every product involved.

Inside the transaction, the debit is still a conditional write that keeps the balance at zero or above.

:::distinguish
Two-phase locking keeps concurrent transactions in one database apart (more on [two-phase locking](../transactions/#running-as-if-one-at-a-time)). Two-phase commit makes one transaction commit on all of several nodes or on none of them. It gives atomicity, not isolation: the database adds concurrency control on top, such as locks or checks on snapshots.
:::

:::do
Keep writes that must be atomic on one shard when the data allows it. Otherwise use the distributed transactions of a database that keeps their state in consensus groups. Avoid two-phase commit across services and different products.
:::

## Ordering transactions across nodes by time

An audit report reads all balances at one moment. Each shard keeps old row versions with MVCC, so the report can read every shard "as of" one timestamp. The snapshot must include everything that each change it shows depended on, and each shard must have applied every commit up to that timestamp before it answers. Otherwise the report can show Ben spending money that has not reached him.

::diagram{name="snapshot-read"}

An auditor may also confirm a transfer by phone and then start the report. To include that transfer, the timestamps must follow real time: a transaction that finished before another started must get the smaller timestamp. Clocks on the shards disagree, so plain server timestamps cannot give this order.

Three ways to get such timestamps:

- A **timestamp oracle**: one service hands out increasing numbers, and every transaction gets its timestamps from it, in [Percolator](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/), described by Google in 2010, once at the start and once at the commit. [TiDB](https://docs.pingcap.com/tidb/stable/tso/) uses one too. It is simple and exact. Requests can be batched, but each transaction still waits for the oracle, so it should sit close to the transactions, and it must be replicated so that it does not become a single point of failure.
- **TrueTime**, in Spanner: the clock returns an interval [earliest, latest] that contains the real time under its clock assumptions. GPS receivers and atomic clocks in each data center keep the interval narrow. A transaction picks a commit timestamp no smaller than "latest" and than the timestamps its participants proposed, then waits until "earliest" has passed it before the commit becomes visible. This **commit wait** makes any transaction that starts later get a larger timestamp. In [2012](https://www.usenix.org/system/files/conference/osdi12/osdi12-final-16.pdf), the error on each side of the reading was 1 to 7 ms, usually about 4 ms, and part of the wait overlapped with the replication of the commit. Cloud providers now offer clocks with error bounds too, such as [AWS ClockBound](https://github.com/aws/clock-bound).
- A **hybrid logical clock**: a timestamp made of physical time plus a counter. The physical part follows the largest physical time known to the node, from its own clock and from timestamps it receives. When the physical parts are equal, the counter puts the new event after both the node's previous event and any message it receives. Timestamps then respect cause, never go back, and stay close to real time, but they give no real-time order between unrelated events. In its [2022 design](https://www.cockroachlabs.com/blog/living-without-atomic-clocks/), CockroachDB uses such timestamps with a configured maximum clock skew. A read that finds a value with a timestamp just above its own, within that clock skew, restarts with a later timestamp, and a node shuts down when the cluster finds its clock off by more than the limit.

::diagram{name="timestamp-sources"}

::diagram{name="hlc-receive"}

With commit wait, Spanner gives **strict serializability**: transactions act as if they ran one at a time, in an order that matches real time. CockroachDB gives serializable transactions, but two transactions on unrelated rows can get timestamps in the opposite order of real time when clocks are off by less than the limit. In both, the timestamps order transactions and pick the versions to read, and the database's concurrency control gives isolation.

:::tradeoff
A timestamp oracle costs a wait for its answers and fits transactions that run close to it. Commit wait costs a few milliseconds per write and needs clocks with a known error. Hybrid logical clocks need no special hardware and keep causal order, but alone they give no real-time order; CockroachDB adds read restarts and a clock skew limit.
:::

## Steps that cannot be rolled back

Anna tops up her wallet with $100 from her card. The wallet asks a payment provider to charge the card, then credits her balance. The provider is another company's system: it does not take part in two-phase commit, and a charge cannot be rolled back, only refunded. The provider may also finish the payment later, long after its first answer.

A **saga** splits such a change into local transactions, each in one system, that commit one by one. A step that may need undoing gets a **compensating transaction** that reverses its business effect, as a refund reverses a charge. A refund does not erase the charge: both stay in the records. If the saga gives up before its pivot, it runs the compensations of the finished steps in reverse order. After the pivot, it retries the remaining steps.

The step after which the saga only moves forward is its **pivot**. Steps after it must not fail for business reasons. In the top-up, the wallet first records the top-up as pending and checks the limits, then charges the card, which is the pivot, then credits the balance. The account cannot be closed while a top-up is pending, so the credit can always happen. If the charge is declined, the compensation marks the top-up failed.

::diagram{name="saga-steps"}

A saga finishes only if its recovery works. Store the saga's state and a stable ID for each step. When the result of a step is unknown, ask the other system or retry with the same ID. Write a local change and the message that starts the next step in one transaction. <!-- link: patterns/async-processing --> If retries cannot settle the outcome, reconcile the records of both systems, such as the wallet's and the provider's.

A saga has no isolation across its steps, though each local transaction keeps its own. Between steps, other requests see the middle state, such as a charge whose credit has not landed yet. The usual defense is a **semantic lock**: mark records as pending until the saga ends, and make other operations check the mark, so pending money cannot be spent. In **try, confirm, cancel**, the first step only holds the money, and a later step moves it or releases the hold. <!-- link: patterns/reservations -->

::diagram{name="semantic-lock"}

With orchestration, one service stores the saga's progress and drives its steps, so one place shows where every saga stands. With choreography, each service reacts to events from the others, which suits small, simple flows. <!-- link: patterns/sagas -->

::diagram{name="orchestration-vs-choreography"}

| | Two-phase commit | Saga |
|---|---|---|
| Result | all or nothing, enforced by the protocol | all steps, or compensations of the finished ones, if recovery succeeds |
| Isolation | from the database's concurrency control | none across the saga; each local transaction keeps its own |
| Who can take part | nodes that support prepare | systems whose steps can be retried safely and then compensated or completed |
| Typical duration | milliseconds | seconds to days |
| When a node fails | participants wait, holding their changes | the saga retries, compensates, or goes to reconciliation |

:::do
Keep a change in one database transaction where you can. Use two-phase commit inside one distributed database, and a saga for a change of several steps across services or outside systems, when the middle states are acceptable and every step has defined recovery.
:::

## Picking a guarantee per operation

The wallet now runs in two regions, with sharded accounts, the majority of each group's voting nodes in Europe, a coordination service, and sagas for card top-ups. Each operation gets the weakest guarantee that keeps it correct:

| Operation | Guarantee | How | During a network partition |
|---|---|---|---|
| Transfer between users | atomic, with a conditional debit | a distributed transaction: consensus per shard, two-phase commit across shards | refused on the side without the majority |
| Taking a handle | linearizable | compare-and-set in a consensus store | refused on the side without the majority |
| Balance after a notification | includes the notified transfer | the notification carries a token, such as the shard and log position of Ben's account; the nearest copy waits until it has applied it | waits until the copy has the transfer; a stale view, if offered, is labeled |
| Balance on its own | may be stale | the nearest copy, with the time of its last update | served |
| History, requests, notifications | causal | the nearest region, writes shown after their dependencies | served while the region holds the client's past |
| Like counters | eventual | the nearest copy | served |
| Card top-up | saga | a pending record, the charge as the pivot, the credit retried | kept pending on the side without the majority |
| Nightly payout job | each payout once, even if two runners overlap | a lock with a lease and a fencing token from a coordination service; a payout ID that the bank processes once | no new lock grants on the side without the service's majority |

:::interview
For each operation in a design, name the guarantee it needs and why. Then say what it costs without failures, in latency, and during a network partition, in refused requests. "The system is strongly consistent" is not an answer: say which reads and writes are linearizable, which checks are atomic, and which reads may be stale.
:::

## Cheat sheet

- Linearizability: every operation takes effect at one moment between its request and its answer, in one order that matches real time. Use it for reads that follow a signal; guard rules with atomic conditional writes or transactions.
- CAP: during a network partition, a system cannot both stay linearizable and complete every request. Choose per operation; if both sides accept conflicting writes, define how to merge them and repair any rule they break.
- PACELC: without a partition, keeping one order still makes nodes wait for each other. Pay that latency only where needed, and use weaker guarantees, such as bounded staleness or session, elsewhere.
- Causal consistency: writes that depend on each other show up in order everywhere. It can keep working during a partition for clients that stay with a copy that holds their past; sequential and linearizable cannot.
- Clocks: time-of-day clocks jump and differ between nodes; monotonic clocks measure durations on one node. Do not order events across nodes by time-of-day timestamps alone.
- Logical clocks: a Lamport clock gives one sort order that respects cause; a vector clock also detects concurrent events. Neither can decide a winner while some events may be missing.
- Consensus: crash-tolerant algorithms decide by majority with durable votes and logs; 2F + 1 voting nodes survive F crashes, and the side without a majority stops. Use a proven store on 3 or 5 nodes.
- Raft elections: terms, random election timeouts, one durable vote per term, votes only for candidates whose log is not behind. Terms fence old leaders; writes pause for about an election timeout plus the election.
- Raft log: an entry of the current term is committed once a majority has saved it, with every entry before it. Use idempotency keys against retries, and a read barrier, or a lease the implementation enforces, for linearizable reads.
- Coordination services: etcd, ZooKeeper, or Consul for small metadata such as locks, leases, leaders, configuration, and shard maps. A lock for correctness needs a fencing token checked atomically where the work lands, or, for fixed work, an ID the receiver processes once.
- Two-phase commit: participants prepare and promise, the coordinator decides. A failed coordinator leaves participants in doubt with changes locked; consensus groups survive node loss but still wait without a majority. Use it inside one distributed database.
- Timestamps across nodes: a timestamp oracle, TrueTime with commit wait for strict serializability, or hybrid logical clocks, which keep causal order but alone give no real-time order.
- Sagas: local steps, compensated in reverse if the saga gives up before its pivot and retried after it, with no isolation across the saga. Store the state and step IDs, make every step safe to retry, and mark middle states as pending.
- Per operation: name the guarantee each operation needs and what it costs in latency and during a partition.

## Sources

- Unmesh Joshi. [Patterns of Distributed Systems](https://martinfowler.com/books/patterns-distributed.html). Addison-Wesley, 2023. "Consistent Core", "Generation Clock", "Hybrid Clock", "Clock-Bound Wait", "Lease", and "Two-Phase Commit".
- Martin Kleppmann, Chris Riccomini. [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/), 2nd edition. O'Reilly, 2026. Chapters 8, 9, and 10.
- Alex Petrov. [Database Internals](https://www.oreilly.com/library/view/database-internals/9781492040330/). O'Reilly, 2019. Chapters 10, 13, and 14.
- Dimos Raptis. [Distributed Systems for Practitioners](https://leanpub.com/distributed-systems-for-practitioners). Leanpub, 2020. Chapters 2–6 and 9.
- Chris Richardson. [Microservices Patterns](https://www.manning.com/books/microservices-patterns). Manning, 2018. Chapter 4.
- Dominik Tornow. [Think Distributed Systems](https://www.manning.com/books/think-distributed-systems). Manning, 2025. Chapters 2, 6, 9, and 10.
- Maarten van Steen, Andrew S. Tanenbaum. [Distributed Systems](https://www.distributed-systems.net/index.php/books/ds4/), 4th edition. distributed-systems.net, 2023. Chapter 5.
- Roberto Vitillo. [Understanding Distributed Systems](https://understandingdistributed.systems/), 2nd edition. 2022. Chapters 8–13.
- Alex Xu, Sahn Lam. [System Design Interview: An Insider's Guide, Volume 2](https://www.amazon.com/dp/1736049119). ByteByteGo, 2022. Chapters 11 and 12.
- Hector Garcia-Molina, Kenneth Salem. [Sagas](https://dl.acm.org/doi/10.1145/38713.38742). SIGMOD, 1987.
- Diego Ongaro, John Ousterhout. [In Search of an Understandable Consensus Algorithm](https://www.usenix.org/conference/atc14/technical-sessions/presentation/ongaro). USENIX ATC, 2014.
