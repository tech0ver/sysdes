---
title: Replication
description: How copies of data on several nodes stay in sync, from leaders and followers to replication lag, failover, conflicts, and quorums.
---

Almost every system design keeps copies of its data on several nodes, and a change takes time to reach every copy. To defend a design, you need to know who accepts writes, when a write counts as done, what a read may see while the copies catch up, and what a failure can lose.

## Keeping a copy on another node

An online store keeps its catalog, customer accounts, orders, and carts in one database. Shoppers browse far more than they buy, so most requests read products and prices. When this node fails, the store stops. While it works, every read from every country lands on this one machine.

**Replication** keeps a copy of the same data on several nodes. Each copy is a **replica**. Replicas let the data survive the loss of a node, spread reads over many machines, and put a copy close to the users who read it. The hard part of replication is keeping the copies in step while the data changes.

The most common design has one **leader** and several **followers**. All writes go to the leader. It applies each write and sends the change to every follower through the **replication log**, a stream of changes in the order the leader applied them. Each follower applies the same changes in the same order, so it goes through the same states as the leader, only later. Reads can go to any replica.

::diagram{name="leader-followers"}

Products also call these roles primary and secondary, primary and standby, or source and replica, and older documents say master and slave. A replica is any copy, the leader included.

In the store, a product page reads from a follower, and a new order goes to the leader. Since one node orders all writes, the replicas never disagree on which write came first.

Followers add read capacity, not write capacity. Every follower must apply every write, and that work takes capacity it could spend on reads. When the writes or the data outgrow one node, the data is split into shards, and each shard has its own leader and followers.

::diagram{name="read-capacity"}

The leader still has to decide when to tell the client that a write is done.

## Deciding when a write is done

A shopper places an order. The leader saves it and answers "order placed". A moment later the leader's machine dies, before the change has left it. A follower takes over without the order, and the shopper's confirmed purchase is gone.

With **asynchronous replication**, the leader confirms a write once it is durable on its own disk (more on [durable writes](../storage-engines/#surviving-a-crash)), without waiting for followers. The change reaches them in the background. Writes are fast, and the leader keeps working even when every follower is slow or down. The cost is the case above: if the leader's disk is lost, or a follower takes over before it got the write, a confirmed write disappears.

With **synchronous replication**, the leader confirms a write only after a follower has saved it to its own disk. A confirmed write then survives the loss of the leader, as long as the failover promotes that follower or another one that has every confirmed write. The cost is that every write waits for the follower, and when that follower is slow or down, writes stop. Making every follower synchronous is impractical: any one failed node would stop all writes.

::diagram{name="sync-vs-async"}

A common compromise is **semi-synchronous replication**: the leader waits for one follower and lets the others catch up in the background. While that follower answers, every confirmed write is on at least two nodes. If it fails, the system must pick another follower to wait for, or fall back to asynchronous replication. Some systems wait for a majority of replicas instead, such as three of five. <!-- link: fundamentals/consistency -->

A cloud region has several separate failure areas called **availability zones**, each with one or more data centers. Zones are close enough that waiting for a follower in another zone adds little, though every write still waits for that round trip. Spread replicas over zones to survive the loss of one zone, for example three replicas, one per zone. Surviving the loss of a whole region needs copies in another region.

::diagram{name="semi-sync-zones"}

Products differ in what "the follower has it" means: received, saved to disk, or applied and visible to reads. In PostgreSQL, once synchronous followers are configured, [`synchronous_commit`](https://www.postgresql.org/docs/current/runtime-config-wal.html) chooses which of these to wait for, even per transaction. <!-- link: technologies/postgresql -->

:::avoid
Do not assume that a semi-synchronous write is always on two nodes. MySQL waits for one follower for [10 seconds by default](https://dev.mysql.com/doc/refman/8.4/en/replication-options-source.html), then [falls back to asynchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html) without telling the client, until a follower catches up. Monitor this state. <!-- link: technologies/mysql -->
:::

:::do
Replicate asynchronously when losing the last moments of writes is acceptable. When a confirmed write must survive the loss of the leader, add one synchronous follower in another zone of the same region. Between regions, replicate asynchronously, unless losing a region must lose no confirmed write: then use a majority across regions and accept slower writes.
:::

## Choosing what the log carries

The store's database needs an upgrade to a new major version, and sales must not stop for it. The analytics team also wants every change to orders as it happens. Both depend on what the replication log contains.

**Statement-based replication** sends each write statement, and every follower runs it again. The log is small, but every follower must get exactly the same result, and some statements do not give it: `UUID()` returns a new value on each node, and an `UPDATE` with `LIMIT` can pick different rows. Databases that use it [mark such statements as unsafe](https://dev.mysql.com/doc/refman/8.4/en/replication-rbr-safe-unsafe.html) and can log their changed rows instead.

**Physical replication** sends the WAL itself: which bytes changed in which page. A follower becomes a byte-for-byte copy of the leader. It is simple and exact, but it ties every replica to one storage format, usually one major version, so a major upgrade usually needs downtime. Every change to every index page also crosses the network.

**Logical replication** sends changes to rows: the values of an inserted row, the key of a deleted row, the key and new values of an updated row. A commit record marks which changes commit together. The log does not depend on how each node stores its pages, so a follower can run a newer compatible version and builds its own indexes. Upgrade the followers first, check that one of them has everything it needs to take writes, then switch to it with a short pause. Some things may not be copied this way, such as [schema changes in PostgreSQL](https://www.postgresql.org/docs/current/logical-replication-restrictions.html). Other systems can read the same log, which is how CDC feeds a warehouse or a search index with every change. <!-- link: patterns/async-messaging -->

::diagram{name="log-formats"}

In 2016, Uber [moved from PostgreSQL to MySQL](https://www.uber.com/blog/postgres-to-mysql-migration/) partly for this: physical replication sent every index change between data centers, and each major upgrade needed downtime.

:::do
Prefer a logical log when you need upgrades with only a short switch, replicas on different versions, or a stream of changes for other systems. A physical log fits a cluster of identical nodes. Avoid statement-based replication.
:::

## Starting a new copy

Before a sale, the store adds a follower to take more reads. Copying the leader's files while writes go on gives a copy in which each file comes from a different moment.

Take a consistent snapshot of the leader while writes go on, and record the **log position** it matches. The new follower loads the snapshot and asks the leader for every change after that position. To catch up, it must apply changes faster than the leader produces new ones, so add followers before the load peaks. Once caught up, it receives changes as they happen. A follower that was down skips the snapshot: it asks for the changes after the last position it applied.

::diagram{name="new-follower"}

Either way, the leader must still have the log from that position on. Keeping a long log takes disk space on the leader. If the needed part is deleted and no archive holds it, the follower starts again from a new snapshot.

## Undoing a bad write

A release with a bug sets the price of every product to zero. The leader applies the update, and within a second every follower applies it too. Replication copies a mistake as faithfully as a good write. A replica protects against losing a machine. Against a bad write or corrupted data, you need an older copy.

A **backup** is a copy of the data as it was at an earlier moment. Take a snapshot regularly and archive the database's log since then, for example in object storage. With a snapshot and an unbroken log after it, the database can return to any moment that the log covers: restore the last snapshot before the mistake and replay the log up to just before it. This is **point-in-time recovery**. Changes after the end of the archived log are gone if the live copies are lost. A new follower can also start from these files, which takes the copying work off the leader.

A delayed follower applies every change an hour late. If a bad write is noticed within that hour, stop the delayed follower before it applies the write, and recover the data from it. It covers only that hour, so it does not replace backups.

::diagram{name="backup-pitr"}

In 2017, an engineer at GitLab [deleted the leader's data](https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/) instead of the follower's while rebuilding the follower. The regular backups had been failing without anyone noticing, and the team restored from a disk snapshot about six hours old, losing six hours of data.

:::avoid
Do not count replicas as backups. Keep backups in a separate place, restore from them regularly in a test, and measure how long a restore takes: a backup that was never restored may not work.
:::

## Reading from a copy that is behind

Product pages read from followers, and most of them are asynchronous. Now the store changes the price of a mug. For a moment the leader shows the new price and a follower the old one.

The delay between a write on the leader and the same write on a follower is **replication lag**. It is usually under a second, but it has no upper limit: an overloaded follower, a slow network, or a follower that is catching up can fall behind by seconds or minutes. A read from a follower that has not yet applied a write is a **stale read**.

::diagram{name="replication-lag"}

If the writes stop and every follower can still receive the remaining changes, the followers eventually apply all of them, and all replicas match. This promise is **eventual consistency**. It says nothing about how long that takes or what a read returns in the meantime. Asynchronous followers of a relational database are eventually consistent too.

Decide for each read whether a stale answer is acceptable. A product page can show a price that is a second old. The price charged at checkout and the stock check that allows a sale belong on the leader, inside the transaction that writes the order.

Watch the lag. The leader's log position minus the position a follower has applied shows how much log the follower still has to apply. To see the lag in seconds, let the leader write the current time into a row every second: the lag is the time now minus the time in the follower's copy of that row, give or take that second. A follower that falls too far behind should stop serving reads until it catches up.

:::distinguish
"Consistency" here means whether replicas show the same data. In transactions, the same word means that data follows its rules (more on [consistency in transactions](../transactions/#a-rule-across-several-rows)). <!-- link: fundamentals/consistency -->
:::

Lag also breaks what a user expects from their own actions.

## Seeing your own writes

A shopper changes the delivery address. The write goes to the leader, and the checkout page right after it reads from a follower that has not applied it yet. The page shows the old address, and the shopper thinks the change was lost.

::diagram{name="ryw-problem"}

**Read-your-writes** means that a user's reads include the user's own completed writes. It promises nothing about other users' writes, which may still show up late. Ways to provide it:

- Read the data that a user can change from the leader, and everything else from followers. The shopper's own addresses and cart come from the leader; product pages come from followers. This works when the data a user can change is small and easy to tell apart.
- For a short time after a user's write succeeds, such as a minute, send that user's reads to the leader. Take out of reads any follower that is further behind than that. Store the time of the user's last write with their session.
- Remember the leader's log position after the user's write, or a token the database returns for it. A follower serves that user only after it has applied the log up to that point; otherwise the read waits or goes to another replica. This needs a database that exposes such tokens. MongoDB does it in [causally consistent sessions](https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/) with majority reads and writes. <!-- link: technologies/mongodb -->

::diagram{name="ryw-options"}

To keep the guarantee across a user's phone and laptop, store the time or token of their last write on the server, so both devices use it.

When followers are in other regions and the leader is far away, every read sent to the leader pays the trip. Facebook [reduced such stale reads in 2013](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) with per-key markers: after a user in a region without the leader changed some data, a cache miss on that data read it from the leader's region while the local copy might still be behind.

:::do
Send a user's reads to the leader for a short time after their write, or read with a log position when the database supports it. Keep the leader for the reads that need it, so followers still carry most of the load.
:::

## Not going back in time

A shopper opens the order history and sees "shipped". They reload the page, the request lands on a follower that is further behind, and the order is back to "paid". Each answer is a correct past state, but the second is older than the first.

**Monotonic reads** means that after a user has seen some data, they never see an older version of it. It is weaker than always reading the latest data and stronger than eventual consistency.

The simple fix is to send each user to the same replica, for example by a hash of the user ID instead of a random choice. This works while that replica is up. When it fails and the user moves to another replica, they can step back. To avoid that, remember the highest log position the user has seen, and read only from replicas that have reached it.

::diagram{name="monotonic-reads"}

## Seeing writes in order

A shopper asks a question on a product page, and the seller answers it. Another shopper sees the answer before the question.

One query to one replica that follows one log cannot show this: the replica applies the writes in the leader's order, so a query sees the history up to some point. It happens when one page combines reads taken at different points. Parts of the data can replicate separately, such as questions and answers in [different shards with their own logs](../sharding/#splitting-a-table-across-nodes). Or two queries of one page can run at different moments, on different followers or even on the same one.

**Consistent prefix reads** means that when writes happen in some order, every reader sees them in that order and never sees a later write without the earlier ones.

Keep writes that depend on each other in one log, and read them together: store the questions and answers of a product in the same shard, keyed by the product, and load them in one query, or in one transaction that reads a [consistent picture](../transactions/#reading-a-consistent-picture). When that is impossible, the system has to track which write depends on which. <!-- link: fundamentals/consistency -->

Two related guarantees cover a user's own writes. With **monotonic writes**, a user's writes apply in the order the user made them. With **writes follow reads**, a write applies after the writes the user had read before making it, so a reply never comes before its question. One leader whose log survives gives both to a user who waits for each write to finish before the next. Failovers that lose writes, parallel requests, and several leaders need explicit tracking. <!-- link: fundamentals/consistency -->

## Replacing a failed leader

The leader's machine dies during a sale. Followers still serve product pages, but nobody accepts orders.

**Failover** makes a follower the new leader:

1. Suspect the failure. Nodes check each other, and a leader that does not answer within a timeout, such as 30 seconds, is treated as dead, though it may only be slow.
2. Pick the new leader: a follower that has every confirmed write, which is the synchronous follower when there is one, and among those the most up-to-date. The other replicas elect it by majority, or a separate controller appoints it. <!-- link: fundamentals/consistency -->
3. Stop the old leader from writing, send writes to the new one, and make the other followers replicate from it. When the old leader comes back, it must become a follower.

::diagram{name="failover"}

A planned switch, for maintenance or an upgrade, loses nothing: stop writes on the old leader, let a follower apply the whole log, then promote it. An unplanned failover has no such pause. A team can run it by hand or let a tool do it, and each step can go wrong:

- With asynchronous replication, the new leader lacks the last writes of the old one. When the old leader returns, its extra writes conflict with new ones and are usually thrown away, so confirmed orders disappear.
- Other systems may have seen the lost writes. In 2012, an out-of-date MySQL follower [became GitHub's leader](https://github.blog/news-insights/the-library/github-availability-this-week/). Records in Redis that pointed to MySQL rows now pointed to the wrong data, and 16 private repositories were visible to outsiders for seven minutes.
- The old leader may only be slow or cut off from the others, not dead. It keeps accepting writes while the new leader does too. Two leaders at once is **split brain**, and their writes conflict.
- A short timeout fails over on a load spike or a network hiccup, and the failover adds load at the worst time. A long timeout keeps the store without writes for longer.

The defense against split brain is **fencing**: before the new leader takes writes, make sure the old leader's writes cannot take effect. Each new leader gets a higher number, and every node and storage system rejects writes that carry an older number. Some setups also cut the old leader off from the storage or the network. A timeout alone does not prove that the old leader has stopped: a paused process can wake up and keep writing. <!-- link: fundamentals/consistency -->

::diagram{name="split-brain-fencing"}

Set two recovery targets: the **RPO** (recovery point objective), the most recent data you may lose, and the **RTO** (recovery time objective), the longest the recovery may take. Then check that the design meets them for the failures you plan for. A failover to an asynchronous follower typically loses up to its lag and takes seconds to minutes. A restore of a large database from backups can take hours. <!-- link: fundamentals/failures -->

:::do
Promote a follower that has every confirmed write, and keep a synchronous follower when losing confirmed writes is not acceptable. Fence the old leader before the new one takes writes. Pick a timeout that rides out normal spikes, and practice failover before you need it. Fail over automatically within a region; across regions, where a false failover costs the most, let a person decide. After a failover, add a new follower soon: until then, one more failure can lose data.
:::

## Writing from several regions

The store opens in Europe, and the leader is in the US. Followers in Europe serve product pages quickly, but every cart change and order crosses the ocean. If the US region goes down, European shoppers cannot buy anything.

Between regions there are four designs:

- One leader region. All writes go to one region, and the other regions hold followers. Rules over all the data, such as "do not sell more than the stock", stay simple, since one node sees every write. Writes from far away are slow, and losing the leader's region means a failover across regions with asynchronous lag. In 2018, a [43-second network break](https://github.blog/news-insights/company-news/oct21-post-incident-analysis/) made GitHub's tool promote new leaders on the other coast. Both coasts then held writes the other lacked, the site was degraded for 24 hours, and GitHub stopped promoting leaders across regions.
- A home region per user. Assign each user's records to one region, usually the nearest, and route their writes there. Writes stay local while the user is near home. Every record still has one leader, but different records have leaders in different regions. A user who travels writes across the ocean, and moving a user's home is a special operation.
- A majority across three regions. Place the voting replicas so that any two regions hold a majority, and confirm a write once that majority has saved it. Losing a whole region then loses no confirmed write, and the other two keep working. Every write pays a round trip to another region. Databases built on consensus work this way. DynamoDB's [strong mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html) uses exactly three regions: three replicas, or two replicas and a witness that only helps form the majority. <!-- link: fundamentals/consistency -->
- **Multi-leader replication** gives each region a leader that accepts writes and replicates them asynchronously to the leaders of the other regions. Writes are local, and a region keeps working when it is cut off. The cost is that two regions can change the same record at once. No node sees every write, so independent writes cannot check a rule over all the data: two regions can sell the last mug, or register the same email. Such rules need coordination, usually one leader. Many databases add multi-leader on top of a single-leader design, and features built for one writer can fail: generated IDs can collide, and a constraint checked in one region does not see the rows of another.

::diagram{name="region-designs"}

A mobile app that works offline is the extreme case of multi-leader. Each device keeps a local copy and accepts writes, and its lag can be hours or days, so conflicting changes are normal and must merge on their own. <!-- link: patterns/offline-sync -->

:::do
Start with one leader region and followers in the others. Give users a home region when their writes must be fast everywhere. Use a majority across three regions when losing a region must lose no confirmed write, and multi-leader only for data whose concurrent changes can be merged.
:::

Several leaders can change the same record before either sees the other's change.

## Resolving conflicting writes

Two employees edit the title of the same product, one in Europe and one in the US. Each leader accepts its change, and when the changes replicate, each leader receives a different title for the same record.

::diagram{name="write-conflict"}

**Concurrent writes** are writes where neither knew about the other. Time does not matter: two edits made hours apart on two offline devices are concurrent too. A write made after reading the other one is not concurrent: it builds on it and replaces it.

A timestamp cannot tell these two cases apart. A **version vector** can. Each version of a key carries one counter per replica, and a replica increases its own counter on each write it accepts. A client sends back the vector it read together with its write. With two replicas, EU and US, the vector [EU 2, US 1] comes after [EU 1, US 1]: it is ahead in one counter and behind in none, so its write saw the other. The vectors [EU 2, US 1] and [EU 1, US 2] are each ahead in one counter, so their writes are concurrent. Each vector adds a counter for every replica that writes the key.

::diagram{name="version-vectors"}

Ways to handle concurrent writes, from the simplest:

- Avoid them: send all writes for a record to one leader, as with a home region. Conflicts come back when the leader of a record changes.
- **Last write wins**: keep the write with the latest timestamp and drop the other. All replicas end up equal, but a successful write is silently lost, and with clocks that differ a later write can lose to an earlier one. DynamoDB [global tables](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html) resolve conflicts this way by default. <!-- link: technologies/dynamodb -->
- Keep both and merge: the database stores both versions, called **siblings**, and the app merges them on the next read or asks the user. In 2007, Amazon's cart [merged siblings](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) by keeping every item from every version, so an added item was never lost, but a removed item could come back.
- Use data types that merge themselves. A **CRDT** is a counter, set, list, or text that merges concurrent changes by a fixed rule, so every copy reaches the same value without asking the app. Amazon's cart brought removed items back because a plain union cannot tell "removed on one device" from "still there on the other". A suitable CRDT set tells an old copy of an item from a new addition, so merging an old copy does not undo a removal. Each set type also decides what wins when an add and a remove are concurrent. <!-- link: patterns/offline-sync -->

::diagram{name="conflict-handling"}

Some rules cannot be merged. Two regions that each sell the last mug have both done something correct on their own, and no merge makes the stock right (more on [rules across rows](../transactions/#a-rule-across-several-rows)). Such writes need coordination, usually one leader.

:::do
Avoid conflicts by giving each record one leader. Where they cannot be avoided, merge them with siblings or CRDTs.
:::

:::avoid
Do not use last write wins where losing one of two concurrent writes matters, such as a cart or a counter. It drops writes without an error. It is safe when each key is written once, or when the lost write does not matter.
:::

## Writing without a leader

Adding an item to the cart must work even while nodes fail. A failover that stops writes for 30 seconds loses sales. Amazon described Dynamo, its store for this case, in a [2007 paper](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf), and Cassandra and similar stores follow its design.

**Leaderless replication** lets any replica accept writes. The client, or a node acting for it, sends each write to all N replicas of the key and treats it as done once W of them confirm. A read asks the replicas, waits for R answers, and compares their versions. It returns the winner under the store's conflict rule, or all concurrent versions for the app to merge. A replica that was down simply misses the writes made meanwhile.

N is the number of replicas of a key. W is how many must confirm a write, and R is how many must answer a read: these are the **quorum** sizes. If W + R > N and both use the same N replicas, any W replicas and any R replicas share at least one. With N = 3, any two replicas share one with any other two. After a confirmed write, a read then reaches at least one replica that has it, as long as the replicas keep what they confirmed.

::diagram{name="quorum-overlap"}

The common setting is N = 3, W = 2, R = 2: reads and writes keep working with one replica down. With N = 5, W = 3, R = 3, they survive two. For majority reads and writes, three or five replicas are common: a fourth replica raises the majority to three but still survives only one failure. Shifting the numbers moves the cost: W = N and R = 1 makes reads cheap, but one failed replica stops writes.

The overlap makes a read return the latest value in normal work, but it is not a guarantee:

- With last write wins by the clock, a node with a fast clock can make an older write beat a newer one, and the newer write is lost.
- While a write has reached fewer than W replicas, it is not confirmed yet. A read in this window can see the new value, and a later read can still see the old one.
- A write that reached fewer than W replicas reports a failure, but it is not undone where it landed, and later reads may or may not see it. A client that got an error or a timeout cannot assume the write did not happen, so it must retry safely (more on [failed calls](../networking/#when-a-call-fails)).
- The replicas of a key can change, for example while nodes are added, or a replica can be restored from an old copy. A write and a later read may then miss each other.
- A **sloppy quorum** accepts confirmations from substitute nodes when the usual replicas do not answer. Writes keep working, but a read from the usual replicas can miss the write until the substitutes hand it back.
- Two concurrent writes are both "the latest", which is a conflict to resolve.

::diagram{name="quorum-caveats"}

In a [2013 Jepsen test](https://aphyr.com/posts/294-call-me-maybe-cassandra), Cassandra with quorum reads and writes kept updating one cell, and last write wins silently dropped 28% of the confirmed writes. Treat W and R as a dial for how often a read is stale. Lowering W makes writes wait for fewer replicas, and lowering R does the same for reads, so each survives more failed replicas. With W + R ≤ N, though, the read and write sets may not overlap. How often a read is then stale depends on how fast changes spread: a [2012 study](https://arxiv.org/abs/1204.6082) based on production latencies found such reads often fresh within tens of milliseconds. <!-- link: fundamentals/consistency -->

Without a leader there is no failover: a slow or dead replica is one of N, and the client uses the answers that come first. The costs are conflicts on concurrent writes and lag that is hard to measure without one log. A larger quorum also waits for more replicas, so a slow one delays it more often.

Across regions, a write can wait only for a quorum in its own region and reach the other regions in the background, as Cassandra's [`LOCAL_QUORUM`](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html) does. Writes stay fast, but a read in another region may be stale. <!-- link: technologies/cassandra -->

:::distinguish
Dynamo, the 2007 design, is leaderless. DynamoDB, the AWS service, is not: each shard has a [leader elected among its replicas](https://www.usenix.org/conference/atc22/presentation/elhemali).
:::

A replica that missed a write keeps the old value until something repairs it.

## Repairing copies that missed writes

A replica was down for an hour during the sale. It is back, and many of its carts are old.

**Read repair** fixes replicas during reads: when a read finds a replica that lacks the newest version, or lacks concurrent versions that the others keep, it writes them back to it. It fixes keys that are read often and leaves rarely read keys old.

::diagram{name="read-repair"}

**Hinted handoff** covers the outage itself: while a replica is down, another node stores the writes meant for it with a hint and passes them on when it returns. This is how the writes of a sloppy quorum get home. Cassandra's [`ANY`](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html) level can confirm a write from a stored hint alone, before any usual replica can serve the new value. <!-- link: technologies/cassandra -->

::diagram{name="hinted-handoff"}

**Anti-entropy** compares replicas in the background and copies what each one is missing, so it also repairs keys that nobody reads. Sending all the data to compare it would cost too much, so replicas compare a **Merkle tree**: hashes of key ranges, where each upper hash covers the hashes below it. Replicas compare the top hashes, go down only where they differ, and copy just those ranges. Repair still costs disk and network time.

::diagram{name="anti-entropy"}

A delete needs the same care. It is written as a tombstone, and after a grace period the tombstone may be purged. If a replica missed the delete and the tombstone is purged before repair reaches that replica, the deleted value comes back from it. A replica that was away longer than the grace period must be rebuilt from a current copy. Cassandra's default grace period is 10 days, and its documentation asks to [repair every node](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/repair.html) at least every 7 days. <!-- link: technologies/cassandra -->

::diagram{name="tombstone-resurrection"}

:::do
Finish repair on every replica within the tombstone grace period, and rebuild replicas that were away longer. Rely on read repair only for keys that are read often, and on hinted handoff only for short outages.
:::

## Picking a replication scheme

In the store, orders and stock use one leader. Accounts use a home region per user, which still gives each record one leader. Carts use leaderless replication. Each scheme answers "who accepts writes" differently, and the rest follows:

| | Single leader | Multi-leader | Leaderless |
|---|---|---|---|
| Who accepts writes | one leader | a leader per region or device | any replica |
| A write is done | on the leader, plus synchronous followers | on the local leader | on W replicas |
| Concurrent writes | ordered by the leader | conflicts to resolve | conflicts to resolve |
| Global rules (stock, unique names) | checked in local transactions | need extra coordination | need extra coordination |
| When the leader or a node fails | leader: failover, writes pause | other leaders keep writing | nothing, while W and R replicas still answer |
| Fits | most systems | writes in several regions, offline apps | writes that must keep working while nodes fail, and can merge |

Most designs need a single leader: followers in other zones and regions, asynchronous or semi-synchronous replication, reads from followers where a stale answer is fine, and read-your-writes where users expect to see their changes.

During a network break, a system either refuses some requests or lets copies disagree. A single leader refuses writes on the side without it; multi-leader and a sloppy quorum keep writing and let copies disagree. This choice is what CAP describes. <!-- link: fundamentals/consistency -->

:::interview
When asked how data is replicated, answer three questions: who accepts writes, when a write counts as done, and what a read may see. Then say what a failover loses, and which reads must go to the leader.
:::

## Cheat sheet

- Replication keeps the same data on several nodes. In the usual design, one leader takes all writes and sends them to followers in one order through the replication log; reads can go to any replica.
- Asynchronous replication is fast but can lose confirmed writes that had not reached a follower. Synchronous replication waits for a follower to save the write, keeps it if that follower is promoted, and stops writes when the follower fails. Use one synchronous follower in another zone for writes that must survive the loss of the leader.
- Statement logs need statements that give the same result everywhere. Physical logs tie all replicas to one storage format, usually one version. Logical row logs allow upgrades with a short switch between compatible versions and feed CDC.
- A new follower loads a snapshot with its log position, then catches up from the log, applying changes faster than they arrive. The leader must keep the log long enough for followers that are behind.
- Replicas copy bad writes too. Keep separate backups with an unbroken archived log for point-in-time recovery, and test restores.
- Followers add read capacity, not write capacity, and they lag, usually under a second but without limit. Eventual consistency promises only that copies match once writes stop and changes can arrive. Read from the leader whatever decides a write.
- Read-your-writes: read a user's own data from the leader, or from the leader for a short time after their write, with followers further behind than that taken out of reads, or from a follower that has reached the position of their write.
- Monotonic reads: keep each user on one replica while it is up, and track the newest position they have seen to stay safe after a switch.
- Consistent prefix: keep writes that depend on each other in one log, such as one shard, and read them in one query or one consistent snapshot. One leader with an intact log also applies a user's writes in order and after what the user read.
- A planned switch loses nothing. An unplanned failover suspects a dead leader after a timeout, promotes a follower that has every confirmed write, fences the old leader, and redirects writes. It can lose asynchronous writes, confuse systems that saw them, and cause split brain without fencing. RPO is the data-loss target, RTO the recovery-time target.
- Across regions, use one leader region by default, a home region per user for fast local writes, a majority across three regions when a region loss must lose nothing, and multi-leader only for data that can merge. Global rules need coordination, usually one leader.
- Concurrent writes conflict. Avoid conflicts with one leader per record; last write wins drops writes; siblings and CRDTs merge them. Version vectors tell concurrent writes from replacements.
- Leaderless replication writes to W and reads from R of N replicas, usually 3, 2, and 2. With W + R > N a read usually sees the latest confirmed write, but clocks, concurrent writes, failed writes, changed or restored replicas, and sloppy quorums break it.
- Replicas that missed writes are fixed by read repair, hinted handoff, and anti-entropy. Finish repair within the tombstone grace period, or deleted data comes back, and rebuild replicas that were away longer.
- Default to a single leader. Pick multi-leader for writes in several regions or offline, and leaderless for writes that must keep working while nodes fail and can merge.
