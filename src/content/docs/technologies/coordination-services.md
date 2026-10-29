---
title: Coordination services
description: How etcd, ZooKeeper, and Consul keep the small facts that many servers must agree on, what each primitive guarantees, and where the service itself becomes the weak point.
---

Every system of more than one server depends on a few facts that all its servers must agree on: who leads, where each piece of data lives, and which nodes are alive. A coordination service keeps them, and knowing what its primitives guarantee lets you elect leaders, place data, and grant locks safely, and keep the system running when the service itself fails.

## Keeping a few facts every server trusts

A team builds a distributed key-value store, like the one in the interview task "design a key-value store". The data is split into 1,024 [logical shards](../../fundamentals/sharding/#adding-nodes-without-moving-every-key) on 24 storage nodes, and each shard has three replicas: a primary that takes writes and two followers. Clients reach the nodes through 300 routers, which look up the node for each key (more on [finding the shard for a request](../../fundamentals/sharding/#finding-the-shard-for-a-request)). One controller decides where each shard lives and moves shards when a node is added or dies.

The data takes terabytes, but the whole cluster depends on a few small facts: which node holds each shard and which replica is its primary, which nodes are alive, and which process is the controller. There must be one authoritative version of them, and every copy that a router or a node keeps must be safe to use when it falls behind. If an old copy lets a replica keep taking writes for shard 17 after another replica became its primary, the shard has two primaries: split brain (more on [two leaders at once](../../fundamentals/replication/#replacing-a-failed-leader)).

::diagram{name="stale-map-two-primaries"}

Keeping these facts in the controller's memory loses them when the controller dies. A table in an ordinary database moves the problem: the database needs its own failover, an asynchronous follower that takes over can lose the latest change to the map, and nothing tells the routers that the map changed. The facts need a store that keeps every confirmed change after a node fails and puts all changes in one order. That is what consensus gives (more on [committing through a majority](../../fundamentals/consistency/#committing-through-a-majority)). Writing consensus into the store itself is hard to get right, so many systems reuse a tested one.

A **coordination service** is such a store, run as a separate small cluster. Three or five nodes form one consensus group, and each node keeps a complete copy of the data on disk, sized to fit in memory. Every write goes through the leader and is synced to disk on a majority of nodes before it is confirmed. On top of a key-value store with linearizable writes, it adds what coordination needs: keys that disappear when their owner dies, notifications when a key changes, and a number that grows with every change (more on [letting only one node act](../../fundamentals/consistency/#letting-only-one-node-act)).

::diagram{name="service-beside-store"}

Four products shaped the field:

- Chubby, Google's internal lock service, described in a [2006 paper](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/). Systems such as GFS and Bigtable used it to elect a leader, but its most popular use became a name service: where each server runs. It is not available outside Google, but the others copied its ideas.
- ZooKeeper, built at Yahoo and now an Apache project, written in Java. [HBase](https://hbase.apache.org/book.html#zookeeper) depends on it, and so did Kafka until [version 4.0](https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/).
- etcd, written in Go on top of Raft. Kubernetes stores all its cluster state in it.
- Consul, from HashiCorp, which [IBM bought](https://newsroom.ibm.com/2025-02-27-IBM-Completes-Acquisition-of-HashiCorp,-Creates-Comprehensive,-End-to-End-Hybrid-Cloud-Platform) in 2025. It is a service discovery system first: it tracks which instances of each service are healthy and answers DNS queries for them. A key-value store and locks come on top.

etcd and ZooKeeper are open source under the Apache 2.0 license. Consul 1.17 and later use the Business Source License (more on [choosing a service](#picking-a-service-or-none)).

Every node holds every key, so the data must fit in the memory of one machine, and write throughput does not grow with more nodes. The limits show what the products are built for. ZooKeeper checks that each value is under [1 MB](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html#Data+Access), and the docs expect kilobytes. etcd accepts requests up to [1.5 MiB](https://etcd.io/docs/v3.7/dev-guide/limit/), stops taking writes at 2 GiB of data by default, and suggests 8 GiB at most. Consul limits a value to [512 KB](https://developer.hashicorp.com/consul/api-docs/kv). In etcd's [sizing guide](https://etcd.io/docs/v3.7/op-guide/hardware/), a large cluster serves up to 10,000 requests per second and stores up to 1 GB, and only the largest class goes beyond that. A distributed database spreads its data over many consensus groups; a coordination service runs only one.

::diagram{name="one-group-vs-many"}

The metadata of the key-value store fits easily. The map of 1,024 shards takes about 100 KB, there are 24 node records and one controller record, and the map changes a few times a minute when shards move. The user data stays on the storage nodes. Routers do not ask the service on every request: they keep a copy of the map and refresh it when it changes. Chubby's authors called this coarse-grained use. A decision made in the service, such as which node owns a shard, holds for minutes or hours, so the load on the service follows how often the cluster changes, not how many requests the clients make.

:::do
Put in a coordination service the small facts that every node must agree on and that change rarely: the shard map, which nodes are alive, who leads, and shared configuration. Keep user data in the database, and keep the service out of the path of each request: clients cache what they read and refresh it when it changes.
:::

:::avoid
Do not use a coordination service as a general database or a queue. Each write waits for a disk sync on a majority of its few nodes, and every member holds a complete copy of the data. A load that grows with the number of users or requests will overwhelm it.
:::

## Shaping the metadata

The controller writes the first version of the facts: an entry for each of the 1,024 shards with its three replicas and its primary, a record for each storage node with its address, and its own name as the controller. The three products store them in different shapes.

ZooKeeper keeps a tree, like a file system. Each **znode** has a path, such as `/kv/shards/0017`, a value of bytes, and children, so a znode is a file and a folder at once. A read returns the whole value, and a write replaces it. Next to the value, each znode keeps its own version, which grows with every change to the value, and the **zxid** of the change that created it and of the last change to it ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html#sc_zkDataModel_znodes)). The zxid is a number that ZooKeeper gives to every change, in one order across the whole tree.

etcd keeps flat keys, sorted as bytes. There are no folders: a key such as `/kv/shards/0017` is just a string, and a range of keys, such as every key that starts with `/kv/shards/`, replaces a listing of a folder. A cluster-wide **revision** grows by one with every change, and a transaction that changes several keys gets one revision. Each key records the revision that created it, the revision of its last change, and its own version. etcd also keeps old values for a while, so a client can read the keys as they were at an earlier revision ([etcd](https://etcd.io/docs/v3.7/learning/data_model/)). Old values take space, and removing them is a maintenance task (more on [history that keeps growing](#metadata-history-that-keeps-growing)).

Consul's key-value store also uses paths, and a read with `recurse` returns every key under a prefix. Each key records the number of the change that created it and of its last change, `CreateIndex` and `ModifyIndex`, taken from one cluster-wide counter ([Consul](https://developer.hashicorp.com/consul/api-docs/kv)). Next to the key-value store, Consul keeps a catalog of nodes, services, and health checks with its own API, built for service discovery. <!-- link: patterns/service-discovery -->

So all three give every key a version of its own and put every change on one counter: the zxid, the revision, or Consul's change number. The version of a key lets a client change it only if nobody changed it since the read (more on [changing a value safely](#changing-a-value-without-losing-someone-elses-change)). The counter orders changes across keys: a change with a larger number happened after one with a smaller number, so a client can tell which of two copies is newer.

::diagram{name="data-models"}

The shard map can be one value or one key per shard. One value of about 100 KB is simple: a reader gets the whole map in one read, and a change replaces it at once. But every change to one shard rewrites all 100 KB, sends all of it to every reader that follows the map, and two writers that change different shards collide. One key per shard keeps each write small and lets writers change different shards without meeting. The price is a reader that needs the whole map: it must get all 1,024 keys as of one moment, not a mix of old and new.

::diagram{name="one-value-vs-keys"}

etcd reads a range of keys at one revision, so a prefix read returns a consistent map. ZooKeeper cannot read znodes as of an earlier zxid, and its docs promise no single moment for a group of reads, so the map can change between them. A ZooKeeper client needs a way to tell that a set of changes is complete (more on [changing several keys at once](#changing-a-value-without-losing-someone-elses-change)).

::diagram{name="map-at-one-moment"}

The key-value store keeps one key per shard under `/kv/shards/`, one key per storage node with its address under `/kv/nodes/`, and the controller's key apart from both.

:::do
Give each fact that changes on its own its own key, and group related keys under a common prefix or parent. Keep one value for an object that is always read and replaced as a whole, as long as it stays small. When a reader needs many keys as of one moment, read them at one revision in etcd, or mark complete changes in ZooKeeper.
:::

## Changing a value without losing someone else's change

An operator drains node 5 before maintenance, and a tool moves its shards to other nodes. At the same moment, the controller sees that node 9 died and replaces node 9 in the replicas of shard 17. Both read the key of shard 17, change their part, and write the whole value back. The later write brings back what the earlier one replaced: a lost update. Shard 17 now lists a dead node, or a node that is about to go away.

::diagram{name="lost-shard-update"}

Each of the three products solves this with compare-and-set on the version of the key. The writer sends the version it read, and the write succeeds only if the key still has that version. Otherwise it fails, and the writer reads the key again, applies its change to the new value, and tries again.

- ZooKeeper: `setData` and `delete` take the expected version of the znode, and `create` fails if the znode already exists ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperOver.html#Conditional+updates+and+watches)).
- etcd: a transaction compares the key's version or the revision of its last change with the one the writer read, and writes only if they match. A comparison with a create revision of 0 means "the key does not exist yet" ([etcd](https://etcd.io/docs/v3.7/learning/api/#transaction)).
- Consul: a write with `?cas=` and the `ModifyIndex` that the reader saw; `cas=0` writes only if the key does not exist ([Consul](https://developer.hashicorp.com/consul/api-docs/kv#create-update-key)).

::diagram{name="compare-and-set-retry"}

The same check makes a retry safe. A write that times out may still have been applied: the client cannot tell, and etcd may drop a request during a leader election without an answer ([etcd](https://etcd.io/docs/v3.7/learning/api_guarantees/)). A blind retry can then overwrite a newer change. A retry with the old version fails instead, but the failure only says that the key changed, not who changed it. The writer reads the key and decides from its content. When it must know whether its own attempt ran, it writes a separate receipt key with the operation ID in the same transaction as the change, and keeps that key for as long as retries can come: another writer may already have replaced the value itself. In etcd, compare the revision of the last change rather than the per-key version, which starts again from 1 when a key is deleted and created again.

::diagram{name="receipt-key"}

A change often depends on other keys. The tool may put a replica of shard 17 on node 14 only while node 14 is alive, that is, while a key that node 14 keeps renewing still exists (more on [knowing which nodes are alive](#knowing-which-nodes-are-alive)). A check first and a write later leave a gap in which that key disappears. Even inside one step, the check only shows that node 14 was alive a moment ago. All three products accept a group of operations that runs as one step:

- etcd: a transaction is `If` / `Then` / `Else`. `If` holds comparisons on any keys; when all of them hold, the `Then` operations run, otherwise the `Else` ones. All its writes take effect together at one revision, and a reader that reads the keys in one range read or at that revision sees all of them or none ([etcd](https://etcd.io/docs/v3.7/learning/api/#transaction)). By default, a transaction holds up to 128 operations ([etcd](https://etcd.io/docs/v3.7/op-guide/configuration/)).
- ZooKeeper: `multi` takes a list of operations, including version checks, and runs all of them or none. The data in one `multi` must stay under about 1 MB in total ([ZooKeeper](https://zookeeper.apache.org/doc/current/apidocs/zookeeper-server/org/apache/zookeeper/ZooKeeper.html#multi(java.lang.Iterable))).
- Consul: a transaction holds up to 64 operations, among them checks that a key has a given `ModifyIndex` or does not exist, and is rolled back if any operation fails ([Consul](https://developer.hashicorp.com/consul/api-docs/txn)).

::diagram{name="check-then-write-gap"}

When node 9 dies, its replicas sit in 128 shards, and together with the node's own record that is more than one transaction holds in etcd or Consul. Such a change rarely needs one step anyway. Replace node 9 in each shard with its own compare-and-set, and delete the node's record last, so that no reader finds a shard that points to a node without a record.

::diagram{name="ordered-node-removal"}

A ZooKeeper reader still reads znodes one by one, so it can see part of a change between two reads, even when the writer used `multi`. The ZooKeeper paper describes a marker for this: a znode named `ready`. One writer at a time, such as the elected controller, deletes the marker, changes the other znodes, and creates the marker again. Readers use the data only while the marker exists, and if the writer dies in the middle, the marker stays deleted, and nobody uses half a change ([Hunt et al.](https://www.usenix.org/legacy/event/atc10/tech/full_papers/Hunt.pdf), 2010). A reader that saw the marker before a change began must learn that it was deleted and throw away what it read since (more on [learning about changes without polling](#learning-about-changes-without-polling)).

::diagram{name="ready-marker"}

:::do
Write every key with compare-and-set on the version you read, and retry with a fresh read when it fails. Put the checks and the writes that must happen together in one transaction, and keep it to tens of keys. For a larger change, order single-key writes so that every state in between is valid.
:::

:::avoid
Do not read a key, change it in memory, and write it back without a version check: two writers silently undo each other. Do not retry a timed-out write blindly either: the first attempt may have been applied.
:::

## Knowing which nodes are alive

Node 9 loses power. Nothing in the service changes: its record under `/kv/nodes/` stays, and the controller keeps it in the replicas of 128 shards. Writes to the shards where node 9 was the primary fail until the controller replaces it. A node that dies cannot delete its own record, so the service must do it.

All three products tie a key to a proof that its owner is alive. The owner renews the proof with heartbeats, and when they stop for longer than a timeout, the service deletes the key or frees it. Such a key is called an **ephemeral key**. The servers measure the timeout and decide when it runs out, not the owner, and the decision goes through consensus like any write.

::diagram{name="ephemeral-expiry"}

- ZooKeeper ties it to the client's **session**. A client opens a session with a timeout, and its library sends heartbeats while it has nothing else to send. A znode created as ephemeral lives as long as the session that created it and cannot have children. If the cluster does not hear from the client for the timeout, it ends the session and deletes all its ephemeral znodes. By default, the timeout must be between 2 and 20 ticks of the server, which gives 4 to 40 seconds with the 2-second tick of the sample configuration; `minSessionTimeout` and `maxSessionTimeout` change the bounds ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html#ch_zkSessions)). A session survives a broken connection: the client reconnects to another server and keeps it, if it does so before the timeout.
- etcd uses a lease. A client asks for a lease with a time to live in seconds, attaches keys to it, and renews it over a stream. When the lease runs out or the client revokes it, etcd deletes every key attached to it ([etcd](https://etcd.io/docs/v3.7/learning/api/#lease-api)). The lease does not depend on a connection, and one lease can hold many keys.
- Consul ties a key to a session too, but its session watches health. Every machine runs a Consul agent, and the agents check each other by gossip, a protocol in which each agent pings a few others and spreads what it learns ([Consul](https://developer.hashicorp.com/consul/docs/concept/gossip)). A session belongs to a node and a list of health checks, and ends when the node fails the gossip check, a check turns critical, or an optional time to live runs out without a renewal. A key that a session holds as a lock is released when the session ends, or deleted, if the session was created with the delete behavior ([Consul](https://developer.hashicorp.com/consul/docs/automate/session)). The gossip check finds a dead machine, not a dead process on a live machine: to follow a process, use a health check of the process itself or a TTL that it renews.

The record under `/kv/nodes/` with the node's address stays as it is. Next to it, each storage node creates an ephemeral key under `/kv/alive/` at start and keeps it alive while it runs. When node 9 dies, its key under `/kv/alive/` disappears after the timeout, and the controller replaces node 9 in its shards.

::diagram{name="node-record-and-alive-key"}

The timeout trades detection time against false alarms. With 10 seconds, the shards that node 9 led take no writes for at least 10 seconds after it dies. A shorter timeout ends a session that only paused: a long garbage collection, a slow disk, or a short network outage. The controller then moves 128 replicas off a healthy node, which copies their data over the network and loads the other nodes. Set the timeout above the longest pause you measured, and let the controller act in two steps: move the primary role away at once, and copy a replica to another node only if its owner stays away for minutes.

::diagram{name="timeout-choice"}

::diagram{name="react-in-steps"}

A failover of the service itself must not end sessions. A ZooKeeper session moves with its client to another server. In etcd, a new leader extends all leases, so no lease ends because the service had no leader ([etcd](https://etcd.io/docs/v3.7/op-guide/failures/)). Consul renews session TTLs on a leader change too.

A Consul session without health checks and without a TTL never ends on its own while its node stays registered: Consul will not release its locks, even when the owner is dead, until someone destroys the session. Consul's docs present this as a choice of safety over liveness: no false alarm frees a lock, and an operator steps in after a real failure.

:::do
Register each process as an ephemeral key under a common prefix: a ZooKeeper ephemeral znode, an etcd key on a lease, or a Consul session key with the delete behavior. Set the timeout above the longest pause you measured. React to a lost node in steps: stop sending it work at once, and rebuild its data elsewhere only after it stays away.
:::

The controller now has to learn that a record disappeared, and 300 routers have to learn that the map changed, without asking the service every second.

## Learning about changes without polling

Each router reads the shard map at start and keeps it in memory. When the controller moves shard 17, the routers must switch to the new primary within a second or two. Reading all 1,024 keys every second from 300 routers makes 300 reads of the whole map per second, nearly all of which return what the routers already have, and still leaves up to a second of delay.

::diagram{name="polling-vs-watch"}

All three products let a client read the data and then wait for the next change to it, so the service does the waiting. They differ in what the client gets back.

ZooKeeper has a **watch**: a flag that a read sets on a znode, so that the server sends the client one event when that znode changes. A standard watch fires once. The event says only which znode changed and how, not its new value, so the client reads the znode again and sets a new watch with the same read. Changes between the event and the new read are not reported one by one: the client sees only the latest value ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html#ch_zkWatches)). Kafka's controller ran into this: by the time it re-read a znode after a watch fired, the state could have changed again, and its own memory often disagreed with ZooKeeper for many seconds ([KIP-500](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)). Since version 3.6, a persistent watch stays after it fires and can cover a whole subtree, so a router can watch `/kv/shards` with one call.

::diagram{name="zookeeper-watch-once"}

ZooKeeper promises one thing that makes watches safe to use with reads: a client sees the event for a znode before it sees the new data of that znode. This closes the gap in the `ready` marker: a reader that watches the marker gets the event about its deletion before it can read any of the new values.

::diagram{name="ready-watch"}

etcd's watch is a stream of changes. A client watches a key or a prefix from a revision, and etcd sends every change after it, in revision order, with the new values. It never sends a change twice, never skips one that is still in the history, and never splits the changes of one transaction. A router reads the map at revision 900 and watches from revision 901, so it misses nothing between the read and the watch. When the connection breaks, it resumes from the revision after the last one it fully processed ([etcd](https://etcd.io/docs/v3.7/learning/api_guarantees/#watch-apis)). This works only while that revision is still in the history: if etcd has already removed it, the watch is canceled, and the router must read the whole map again (more on [history that keeps growing](#metadata-history-that-keeps-growing)).

::diagram{name="etcd-watch-resume"}

Consul has the **blocking query**, a form of long polling. A read returns a change number in the `X-Consul-Index` header. The client repeats the read with `?index=` and that number, and the server holds the request until the result changes or the wait runs out: 5 minutes by default, 10 at most, plus a small random extra so that waiting clients do not all return at once. The answer is the whole current result, not a list of changes, and a return does not prove that anything changed. If the number goes back, after a restore from a snapshot for example, the client must read everything again; it never blocks with a number below 1, or its loop stops waiting and floods the servers ([Consul](https://developer.hashicorp.com/consul/api-docs/features/blocking)).

::diagram{name="blocking-query"}

In all three, a notification can come late. etcd sees about 10 ms of delay in a healthy cluster and gives no limit for an unhealthy one ([etcd](https://etcd.io/docs/v3.7/learning/api_guarantees/)). A client that is cut off from the service gets nothing at all, and ZooKeeper's docs tell such a client to go into a safe mode. A router can always act on an old map for a while, so the storage nodes must catch it: each request carries the version of the map, and a node rejects a request made with an older one (more on [a router with an old map](../../fundamentals/sharding/#finding-the-shard-for-a-request)).

::diagram{name="map-version-check"}

:::do
Read the data and start watching from the point of that read: an etcd watch from the next revision, or a ZooKeeper watch set by the same read. Treat each notification as a signal to read again, not as the full history, unless the product promises every change, as etcd does within its history. Expect notifications to be late, and make the receivers of the work check the version of the data the sender used.
:::

:::avoid
Do not poll a coordination service in a tight loop from many clients: the reads load every server and still leave a delay. Do not keep one large value that many clients watch: every change sends the whole value to each of them.
:::

## Choosing one controller

The controller runs on three machines, so that the cluster keeps working when one of them fails. Only one may act at a time: two controllers that move shards on their own plans place the same shard twice or leave it with no primary. The three copies must agree on which of them leads, and the others must take over when it dies.

The simplest election is a race for one ephemeral key. Each copy tries to create `/kv/controller` with its name, only if the key does not exist yet, tied to its session or lease. One write wins, and the winner is the controller. In ZooKeeper this is an ephemeral `create`, and in etcd a transaction that writes the key only if its create revision is 0, with a lease attached; the others watch the key, and when it disappears, because the controller died or quit, they race again. In Consul the key stays: a write with `?acquire=` and a session ID succeeds only if no session holds it, and when the holder's session ends, the key is released, and the waiters, watching it with a blocking query, try to acquire it again ([Consul](https://developer.hashicorp.com/consul/docs/automate/application-leader-election)).

::diagram{name="election-race"}

The race works for three copies. With hundreds of waiters, such as workers that wait for one lock, every release wakes all of them, and they all hit the service at once to try again, while only one can win. ZooKeeper's docs call this the **herd effect**. The fix is a queue: each waiter takes a place in line and watches only the one before it.

- ZooKeeper adds a counter to the name of a znode created as sequential: the parent appends a 10-digit number that grows with each new child. Each candidate creates a sequential ephemeral znode under `/kv/election`, and the one with the lowest number leads. Each other candidate watches only the znode just before its own, so one deletion wakes one client ([ZooKeeper](https://zookeeper.apache.org/doc/current/recipes.html#sc_recipes_Locks)).
- etcd orders the candidates by create revision. Each one writes a key under a common prefix with its own lease, the key with the lowest create revision leads, and each waiter watches for the deletion of the key just before its own. etcd ships this as its election and lock APIs, so clients do not build it themselves ([etcd](https://etcd.io/docs/v3.7/learning/why/)).
- Consul has no queue of this kind: every release wakes all the waiters.

::diagram{name="herd-vs-queue"}

Use a library for this rather than your own code. A lost answer, a broken connection, and an ended session each need their own handling, and tested libraries already have it. For ZooKeeper, [Apache Curator](https://curator.apache.org/docs/recipes) implements the recipes in Java; etcd ships election and lock helpers for Go; Consul has a lock API on top of sessions.

Shards need primaries too, 1,024 of them. Each shard could run its own election among its three replicas, but the simpler design gives that job to the elected controller: it picks the primary of each shard and writes it to the shard's key. The service then runs one election instead of 1,024, and the controller can spread the primaries evenly across the nodes. Kafka works this way: one elected controller assigns the leader of each partition ([KIP-500](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)).

:::do
Elect a leader with your coordination service's election API or a tested library, such as etcd's election API or Apache Curator, not a recipe of your own. Elect one controller and let it assign the many smaller roles, instead of one election per role. When many clients wait for one key, queue them so that each watches only the one before it.
:::

The controller now knows it won. But it can stop for a while, lose its lease while it is stopped, and wake up still sure that it leads.

## A leader that does not know it was replaced

Controller A stops for 40 seconds in a garbage collection pause. Its lease runs out, controller B wins the election and moves shard 17 from node 9 to node 14. Then A wakes up. Its plan, made before the pause, still says that shard 17 should go to node 20, and A writes it. A does not know yet that its lease ran out: it learns that from the next answer of the service, and it writes first. For a moment there are two controllers, and the shard map takes orders from both.

::diagram{name="paused-controller"}

The theory is in [letting only one node act](../../fundamentals/consistency/#letting-only-one-node-act): a lease cannot stop a holder that pauses, and only a check where the work lands can. The coordination service gives that check in two forms, one for writes into the service and one for work outside it.

Writes into the service can carry the condition that the writer still leads. The election key changes owner with every election, so the controller makes each write conditional on its own key:

- etcd: a transaction whose `If` compares the create revision of the controller's election key with the one A got when it won. After a new election, the key is new, and the transaction fails ([etcd](https://etcd.io/docs/v3.7/learning/why/#notes-on-the-usage-of-lock-and-lease)).
- ZooKeeper: a `multi` that includes a check of A's own election znode. When A's session ended, the znode was deleted, and the whole `multi` fails.
- Consul: a transaction that includes a `check-session` operation on the controller key: it fails if the key is no longer locked by A's session ([Consul](https://developer.hashicorp.com/consul/api-docs/txn)).

Work outside the service needs a fencing token. Each grant of the role comes with a number that is larger for every later grant, and every receiver stores the largest number it has seen durably and rejects lower ones, in the same step as the work it protects. The three products have such a number already: the create revision of the election key in etcd, and the zxid that created the election znode in ZooKeeper (`czxid`). Consul's `LockIndex` counts how many times a key has been acquired, but it starts again from 1 when the key is deleted and created again; use it only for one permanent lock key whose sessions release it rather than delete it. A restore of the service from a snapshot can also bring back a counter below the tokens that receivers already hold: before protected work resumes, stop the holders from before the restore and make sure new tokens start above what the receivers have seen, as etcd's restore with a raised revision does. Chubby called the lock's name, mode, and number a sequencer ([Burrows](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)). The controller sends its number with every command to the storage nodes, and a node that has seen a command from B ignores the delayed one from A.

::diagram{name="two-checks"}

Without such checks, a lock in a coordination service does not give mutual exclusion. In 2020, Jepsen tested etcd 3.4.3 locks that protected an outside resource: two clients held the same lock at once, even in a healthy cluster with short lease times, and faster under process pauses and network partitions ([Jepsen](https://jepsen.io/analyses/etcd-3.4.3)). etcd's docs now say that its lock cannot protect outside resources unless they check versions ([etcd](https://etcd.io/docs/v3.7/learning/why/#notes-on-the-usage-of-lock-and-lease)).

Two more measures shrink the window where neither check exists:

- The holder stops on its own. A client that loses its connection to the service must act as if it lost the role, before its session ends on the servers. Apache Curator's docs say to treat a lock as lost as soon as the connection is suspended, and to keep pauses shorter than the session timeout ([Curator](https://cwiki.apache.org/confluence/display/CURATOR/TN10)).
- The service waits before it gives the role away. Chubby and Consul have a lock-delay: when a session ends without a release, nobody may take its locks for a while, 15 seconds by default in Consul, so that a holder that is still alive can notice and stop ([Consul](https://developer.hashicorp.com/consul/docs/automate/session)). Consul calls it a safeguard, not a guarantee.

Both lower the chance of two leaders acting at once; neither removes it.

::diagram{name="shrinking-window"}

:::do
Make every write of a leader conditional on its election key in the same transaction, and send a fencing token with every command it gives outside the service: the create revision in etcd, the `czxid` in ZooKeeper, or `LockIndex` of a lock key that is never deleted in Consul. Have the receivers store the largest token durably and reject older ones. Stop acting as leader as soon as the connection to the service is lost.
:::

:::avoid
Do not use a lock from a coordination service alone to keep two processes from writing the same data. A paused holder can write after its lock has passed to another. Use it alone only where a rare double run costs time, not correctness.
:::

## Reading the freshest value

Node 9 comes back after a restart and reads the map to learn which shards it leads. A second ago, the controller moved the primary of shard 17 from node 9 to node 14, but the server that node 9 asks has not applied that change yet. It still lists node 9 as the primary. Node 9 starts taking writes for shard 17, and so does node 14.

::diagram{name="stale-read-follower"}

A coordination service runs every write through its leader and a majority, but reads can be served in different ways. A read served by one server from its own memory is fast and spreads the load over all servers, but that server may be behind. A read that is sure to return the latest value needs the leader to confirm that it still leads, with a round trip to a majority (more on [committing through a majority](../../fundamentals/consistency/#committing-through-a-majority)). The three products picked different defaults:

- etcd reads are linearizable by default. A client can ask for a serializable read instead: any member answers from its own copy, which may be behind. In etcd's benchmark of version 3.2 on three 8-vCPU machines with SSDs, 1,000 clients, and 256-byte values, linearizable reads reached 141,000 per second at 5.5 ms on average, and serializable reads 186,000 per second at 2.2 ms ([etcd](https://etcd.io/docs/v3.7/op-guide/performance/)).
- ZooKeeper reads are served by the server the client is connected to, so they may be behind. A client never sees an older state than one it already saw, even after it moves to another server. A client that must see a change made by another client calls `sync` before the read: the server first catches up with the leader. This is not strictly linearizable, because `sync` does not go through a majority; ZooKeeper's docs say that only a write before the read gives that guarantee ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperInternals.html)).
- Consul has three modes. The default mode lets the leader answer alone; it is linearizable except for a short window after an election, when an old leader may still answer. The consistent mode makes the leader confirm its role with a majority first, at the cost of a round trip. The stale mode lets any server answer, even without a leader; its answers are usually within 50 ms of the leader, but with no upper limit ([Consul](https://developer.hashicorp.com/consul/api-docs/features/consistency)).

::diagram{name="read-paths"}

Such guarantees are hard to get right. In 2014, Jepsen found that the "consistent" reads of both etcd 0.4 and Consul could be stale, because any node that still believed it was the leader answered from its own state. Both fixed it, and Consul added the mode with the extra round trip ([Kingsbury](https://aphyr.com/posts/316-call-me-maybe-etcd-and-consul)).

In the key-value store, each reader needs a different guarantee:

- Routers read the map from any server and follow it with watches. A stale map costs a rejected request and a retry, because nodes check the map version.
- The controller reads before it writes. A stale read is harmless there: its compare-and-set fails, and it reads again.
- A storage node that decides which shards it leads must see the latest value: a linearizable read in etcd, a consistent read in Consul, or a write before the read in ZooKeeper. Its version check alone does not help here, because a stale read gives it an old map together with the old version. Even a fresh answer can be outdated a moment later, so the right to take writes must still come from the takeover protocol of the shard (more on [surviving an outage](#surviving-an-outage-of-the-coordination-service)).

:::do
Read from any server for data that clients cache and follow anyway, and for reads before a compare-and-set. Pay for a linearizable read only where a decision depends on seeing the latest change: an etcd default read, a Consul consistent read, or in ZooKeeper a write before the read.
:::

:::avoid
Do not assume that a ZooKeeper read, or a Consul read in stale mode, returns the latest write. When one client tells another about a change through any other channel, the other may still read the old value.
:::

## Many clients reading the same data

The store grows to 3,000 routers and 200 storage nodes. Each of them keeps a session or a lease with the service, watches the map, and reads all of it when it starts. A deploy restarts 1,000 routers within a minute, and each one reads the whole map at once. The servers spend their time on reads and heartbeats while the controller waits for its writes.

More voting servers do not help, because every write must reach a majority of them. In the ZooKeeper paper's 2010 benchmark with 250 clients, 1 KB requests, and dual-core servers with a dedicated log disk, 3 servers handled 87,000 reads or 21,000 writes per second, and 13 servers 460,000 reads but only 8,000 writes ([Hunt et al.](https://www.usenix.org/legacy/event/atc10/tech/full_papers/Hunt.pdf)). etcd's docs recommend 3 or 5 members, and probably no more than seven ([etcd](https://etcd.io/docs/v3.7/faq/)). Reads have to scale in other ways:

::diagram{name="voters-reads-writes"}

- Servers that do not vote. A ZooKeeper **observer** receives every change that the majority has accepted and serves reads and watches like any server, and passes writes to the leader, but takes no part in the vote. Observers add read capacity without enlarging the majority that every write waits for, though the leader still sends them every change, and when one fails, the cluster stays available ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperObservers.html)).
- Reads from every server. Consul's stale mode lets followers answer, and its docs call it the most effective way to scale reads ([Consul](https://developer.hashicorp.com/consul/api-docs/features/consistency)).
- A proxy in front of the service. etcd's gRPC proxy merges the watches of many clients on the same key or prefix into one watch on the cluster, merges the streams that renew their leases, and caches range reads ([etcd](https://etcd.io/docs/v3.7/op-guide/grpc_proxy/)). With 3,000 routers that watch the same prefix through ten proxies, etcd serves ten watches instead of 3,000.
- Caching in the client. In its 2006 paper, Chubby served 90,000 clients from one master because clients cached what they read, and the master told them when an entry changed, instead of letting it expire. Their traffic was then mostly heartbeats. Its authors found that caching names that do not exist mattered too. Loads still spiked: a job of 3,000 processes that looked up each other's names made 9 million requests at start and overloaded the master, until a lookup returned the names of about 100 related processes at once ([Burrows](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)).

::diagram{name="observers"}

::diagram{name="watch-proxy"}

Connections and heartbeats cost too. Each ZooKeeper session is created and closed through the leader and a majority, which becomes a bottleneck with thousands of connections. ZooKeeper 3.5 added local sessions that live on one server, but such a session cannot own ephemeral znodes ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html)). In every product, one process should keep one session or lease and share it among its threads, and a lease in etcd can hold all of a process's keys.

The shard map need not come from the service at all. The controller can be the only client of the coordination service and publish the map to the routers itself, by a push to each router or through a store built for many readers. The service then sees one client instead of 3,000. Kafka took this route when it dropped ZooKeeper, as proposed in 2019: brokers fetch metadata changes from the controllers, starting from the last change they have ([KIP-500](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)).

::diagram{name="one-publisher"}

:::do
Run 3 or 5 voting servers. Scale reads with non-voting servers, reads from any server, a proxy, or client caches that a watch keeps fresh, not with more voters. Keep one session per process, spread the restarts of many clients over time, and when clients number in the thousands, consider letting one component read the service and publish to the rest.
:::

## Writes that stall

The three servers of the service share their virtual machines with other services to save money. One night a backup job on one of them reads and writes a lot to the same disk. A write to the service now takes a second instead of a few milliseconds, the followers stop getting heartbeats in time and elect a new leader, and the new leader runs on the same busy hardware. For minutes, the controller cannot move shards, and leases and sessions are hard to renew.

Every write of a coordination service waits for a sync to disk on a majority of servers. A request cannot finish faster than the round trip between the servers plus that sync ([etcd](https://etcd.io/docs/v3.7/op-guide/performance/)). All writes go through one leader in one order, so one slow sync delays every write behind it. A leader that cannot sync its log commits nothing, so its followers treat it as dead, even if it still sends heartbeats: etcd's docs say that disk latency is part of leader liveness ([etcd](https://etcd.io/docs/v3.7/faq/)).

::diagram{name="slow-sync"}

So the service needs its own disk:

- etcd recommends dedicated machines and a disk with at least 50 sequential IOPS, such as a 7,200 RPM disk, and 500 for heavy loads, such as a local SSD. Cloud providers publish concurrent IOPS, which can be ten times the sequential figure ([etcd](https://etcd.io/docs/v3.7/op-guide/hardware/)). At the 99th percentile, a sync of the log should stay under 10 ms, and a commit to the data store under 25 ms ([etcd](https://etcd.io/docs/v3.7/faq/)).
- ZooKeeper needs its transaction log on a dedicated device; a dedicated partition is not enough, because other writers on the device cause multi-second delays. It must never swap: give the Java heap less than the machine's memory, such as 3 GB on a 4 GB machine ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperAdmin.html)).
- Consul servers are limited by disk for writes and by CPU for reads ([Consul](https://developer.hashicorp.com/consul/docs/reference/architecture/server)).

The timeouts must fit the hardware. etcd sends heartbeats every 100 ms and starts an election after 1,000 ms without one, by default. Its docs ask for a heartbeat interval close to the round trip between the servers and an election timeout of at least ten round trips ([etcd](https://etcd.io/docs/v3.7/tuning/)). Consul multiplies its own timeouts by `raft_multiplier`, 5 by default, which is tuned for cheap small machines, and its docs recommend 1 in production when the machines and the network allow it ([Consul](https://developer.hashicorp.com/consul/docs/reference/architecture/server)). Raising the timeouts hides short stalls but makes every real failover slower.

Large requests stall a server too. etcd applies requests that touch up to a few hundred keys quickly, but a read of the whole key space delays the requests behind it ([etcd](https://etcd.io/docs/v3.7/faq/)). In the key-value store, one router that reads the keys of all 1,024 shards at start is fine; a thousand routers that restart together are not.

:::do
Run the service on its own machines or at least its own disks, with SSDs and no swap. Watch the sync time of its log, the leader changes, and the slow-request warnings. Tune the heartbeat and election timeouts from measured round trips, and use the same values on every server.
:::

:::avoid
Do not put a coordination service on a disk that other heavy writers share, such as a database or a log collector. Its leader stays alive only as long as its disk syncs stay fast.
:::

## Metadata history that keeps growing

The controller wants to place shards by load, so each of the 200 storage nodes writes its current load to its record every 10 seconds. That is 20 writes per second, or 1.7 million a day. The data stays small, 200 records, but each write leaves something behind on disk.

etcd keeps every old version of a key, so that reads at an earlier revision and watches from an earlier revision work. The old versions stay until a **history compaction** removes all versions older than a chosen revision. After that, reads and watches from before that revision fail, and a watcher that falls that far behind must read everything again. The etcd server does not compact by default ([etcd](https://etcd.io/docs/v3.7/op-guide/configuration/)). It can compact on a schedule, keeping a window of time, such as one hour for keys that change often or 10 hours as a general default, or keeping a number of revisions ([etcd](https://etcd.io/docs/v3.7/op-guide/maintenance/#history-compaction-v3-api-key-value-database)).

::diagram{name="history-compaction"}

Compaction frees space inside etcd's database file, but the file does not shrink. **Defragmentation** rewrites the file and returns the space to the file system. It runs on one member at a time, and that member serves no reads or writes while it runs ([etcd](https://etcd.io/docs/v3.7/op-guide/maintenance/#defragmentation)).

::diagram{name="compaction-vs-defrag"}

When the database reaches its quota, 2 GiB by default, etcd raises an alarm on the whole cluster and accepts only reads and deletes. Writes come back only after an operator compacts, defragments, and clears the alarm ([etcd](https://etcd.io/docs/v3.7/op-guide/maintenance/#space-quota)). For the key-value store, a full etcd means that the controller cannot move a shard and nodes cannot register.

ZooKeeper keeps no history for clients, but its servers write snapshots of the tree and logs of changes to disk, and by default they never delete old ones. The operator turns on purging, which keeps the last few snapshots, three by default, with their logs ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperAdmin.html#sc_maintenance)). Without it, the disk fills.

Snapshots are also the backup. etcd and Consul take a consistent snapshot of the data with one command. ZooKeeper's snapshot files are fuzzy, taken while changes go on, so a backup needs the latest complete snapshot, the log file that was open when it started, and every log after it; ZooKeeper 3.9 can also take and restore a snapshot through its admin API ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperSnapshotAndRestore.html)). Keep backups away from the cluster and test the restore. A restore brings back an older state, and with it an older counter: in etcd, the revision goes back by thousands. Watchers and caches that saw higher revisions then miss changes or keep data that no longer exists. etcd can restore with the revision raised by a large number and all older revisions marked as compacted, so that every watcher starts over ([etcd](https://etcd.io/docs/v3.7/op-guide/recovery/)).

::diagram{name="restore-bump-revision"}

The cheapest fix is fewer writes. Load that changes every 10 seconds is metrics, not coordination: it belongs in a monitoring system, and the controller can read it from there.

:::do
Write to a coordination service only what changes rarely. Turn on automatic compaction in etcd and purging in ZooKeeper, defragment etcd members one at a time, and alert well before the quota. Take regular snapshots, and restore etcd with `--bump-revision` and `--mark-compacted` so that every watcher starts over.
:::

:::avoid
Do not store values that change every few seconds, such as load or metrics, in a coordination service. Each change is a write through consensus and leaves history on disk.
:::

## Replacing a failed member

One of the three servers of the service loses its disk. The other two still form a majority and keep working, but one more failure stops all writes. A new server must take the dead one's place, and the change itself is risky: the set of voting servers decides what a majority is.

Each product changes its members through consensus, as one more write, and only while a majority is up (more on [why voters change only through the store's own procedure](../../fundamentals/consistency/#agreeing-on-one-value)). The order of steps matters:

- Remove the dead member first, then add the new one. With the dead member still listed, a fourth voting member raises the majority from 2 to 3. Until the new server starts, only 2 of 4 members are up and writes stop; after it starts, 3 of 4 are up, and the cluster survives no further failure ([etcd](https://etcd.io/docs/v3.7/faq/)). etcd refuses such a change by default: its strict reconfiguration check rejects a change that leaves fewer started members than the new majority ([etcd](https://etcd.io/docs/v3.7/op-guide/runtime-configuration/)). Other systems may accept it.
- Change one member at a time, and do not keep a cluster of two: its majority is also two, so the loss of either server stops it ([etcd](https://etcd.io/docs/v3.7/op-guide/runtime-configuration/)).

::diagram{name="remove-before-add"}

A new member starts empty and must copy the whole state from the leader. The copy loads the leader's network, which can delay heartbeats and start an election, and until it catches up the new member counts toward the majority without being able to help. In etcd, add it as a **learner** instead, with `etcdctl member add --learner`: a member that receives every change but does not vote. Once it has caught up, the operator promotes it to a voting member, and etcd checks that it really has caught up first ([etcd](https://etcd.io/docs/v3.7/learning/design-learner/)). A learner does not change the size of the majority, so a mistake can be undone without losing it.

::diagram{name="learner"}

ZooKeeper has changed members at runtime since version 3.5. Before, operators changed them with rolling restarts, which its docs say caused data loss and inconsistency in production. Since 3.5.3 the feature is off by default, because anyone who may change the configuration can add a server of their own, so it needs to be turned on and restricted ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperReconfig.html)). Consul's Autopilot, with dead-server cleanup turned on, removes a dead server as soon as its replacement comes up, so that the dead one does not raise the majority; without it, Consul waits 72 hours ([Consul](https://developer.hashicorp.com/consul/docs/concept/reliability)).

When a majority is lost for good, for example two of three servers, the cluster cannot accept the change that would remove the dead ones, because that change needs a majority too. The way back is a new cluster restored from a snapshot, with whatever changes came after the snapshot lost ([etcd](https://etcd.io/docs/v3.7/op-guide/recovery/)).

:::do
Replace a dead member by removing it first and adding the new one second, one member at a time. In etcd, add the new member as a learner and promote it after it catches up. Spread the voting servers over three zones, and keep snapshots for the day a majority is lost.
:::

## Controlling who may change the metadata

The service is reachable from every router and every storage node. Any process that can write to it can point shard 17 at a node of its choice, delete the controller key to force an election, or fill the database until it stops taking writes. A bug in one router or one stolen credential is then enough to break the whole store.

All three products can check who makes each request, but etcd and Consul check nothing until access control is turned on ([etcd](https://etcd.io/docs/v3.7/op-guide/authentication/rbac/), [Consul](https://developer.hashicorp.com/consul/docs/secure/acl)):

- ZooKeeper keeps an access list on each znode: who may read, write, create or delete children, or change the list. The list applies to that znode only, not to its children, so each new znode needs its own ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html#sc_ZooKeeperAccessControl)).
- etcd grants roles to users, and a role allows reading or writing a range of keys, such as everything under `/kv/shards/`. A user signs in with a password or a TLS client certificate.
- Consul gives each client a token linked to policies, which allow or deny access to key prefixes, services, sessions, and other resources. Its default policy for a request that no rule matches is `allow`, even with access control on; set `acl.default_policy` to `deny` ([Consul](https://developer.hashicorp.com/consul/docs/reference/agent/configuration-file/acl)).

In the key-value store, the controller may write the shard map, each storage node may write only its own record, and routers may only read. On top of that, encrypt the traffic with TLS between clients and servers and between the servers, and in Consul, also the gossip between agents, which has a key of its own ([Consul](https://developer.hashicorp.com/consul/docs/concept/gossip)). Identity, certificates, and secrets in general are a topic of their own. <!-- link: fundamentals/security -->

::diagram{name="client-rights"}

:::do
Turn on access control and TLS before the first production client. Give each kind of client the narrowest rights it needs: the writer of a prefix writes only there, and readers only read.
:::

## Running in several regions

The store opens a second region, in the US, for users there, next to the one in Europe. Routers and storage nodes in the US also need the shard map, and the service must decide where its servers stand.

Spreading one cluster over regions makes every write wait for a majority across them. With one server in each of three regions, every write waits for a round trip to the nearest other region, tens of milliseconds instead of one or two, and the election timeout has to grow with it (more on [placing voting nodes](../../fundamentals/consistency/#committing-through-a-majority)). In return, the cluster survives the loss of a whole region. etcd's docs advise keeping the members in one data center, or in data centers close to each other ([etcd](https://etcd.io/docs/v3.7/op-guide/hardware/)). ZooKeeper's docs warn that a cluster split between two data centers sees false failures and partitions from the varying latency between them ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperObservers.html)).

The usual choices are these:

- One cluster in one region, with readers far away. The voting servers stay in Europe, and the US gets ZooKeeper observers or etcd proxies. Observers serve local reads and watches while they are connected; proxies merge the watches of many clients and cache repeated reads, but other reads still cross the ocean, and so do all writes. When the link between the regions breaks, the voting servers are unaffected, and the US clients keep working on the copies they cache but cannot change anything.
- One cluster per region, with nothing shared. Each region runs its own store and its own coordination service, with its own shard map. This is how Consul works: each datacenter has its own servers, catalog, and key-value store, and nothing is copied between datacenters by default ([Consul](https://developer.hashicorp.com/consul/docs/architecture/control-plane)). Federation or peering connects them for service discovery, and copying keys needs a separate tool ([Consul](https://developer.hashicorp.com/consul/api-docs/kv)). A failure in one region does not touch the others.
- One cluster across three regions, for the few facts that must be global and must survive the loss of a region, such as which region owns which users. Such facts change rarely, so slow writes are acceptable.

::diagram{name="region-options"}

Google ran a global Chubby cell with five replicas in distant data centers next to the local ones. The global cell was almost never down, but each client saw it available less often than its local cell: a distant cell is more often cut off from the client, while maintenance of the local cell affects the client's own data center anyway ([Burrows](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)).

For the key-value store, the shard maps are per region: a US shard lives on US nodes, and its map belongs in the US cluster. Only the assignment of users to regions is global.

:::do
Run one coordination service per region for the metadata of that region, so that a region depends only on itself. Keep a cluster across three regions only for the few global facts that must survive a region loss, and serve far readers with non-voting servers or proxies instead of voters.
:::

## Surviving an outage of the coordination service

An operator removes the wrong two servers from the service, and for 20 minutes it has no majority. It accepts no writes, renews no sessions or leases, and elects no leaders. The question is what the key-value store does in those 20 minutes.

The service is small and well tested, but it still goes down: a lost majority, a full disk, a bad upgrade, a broken network. Chubby's authors found that developers treated their service as if it never failed. One team built a system of hundreds of machines that started a recovery of tens of minutes every time Chubby elected a new master, which turned a short failover into a long outage of the whole system. Many clients also crashed on the failover event, which was meant only as a hint to check for changes ([Burrows](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)).

A system survives such an outage when the service is out of the path of each request, and the clients keep working on what they last knew, as long as that stays safe:

- Routers route by their cached map and keep doing so until the service is back. A router that restarts during the outage needs the map from somewhere else: a copy on its local disk, or another router.
- Storage nodes keep serving their shards only if the shard's own replication makes that safe. A primary that keeps its role only while its lease in the service is alive steps down when the service stops, and then every shard stops taking writes at once. A primary can keep its role without the service when the shard's replication protocol itself makes takeovers safe. Its fencing part is a generation number: every assignment of a primary by the controller carries one, the new primary first gets a majority of the shard's replicas to store it durably, replicas reject writes from an older generation, and a write counts only when a majority has accepted it. The protocol must also make a new primary recover every acknowledged write before it serves, keep old and new majorities overlapping when the set of replicas changes, and check its authority before a read that must be fresh, as Raft does (more on [choosing a leader everyone accepts](../../fundamentals/consistency/#choosing-a-leader-everyone-accepts)). The service decides who should lead, and the replicas make it safe. With simpler replication, a primary that cannot renew its lease must stop taking writes.
- What waits for the service is what changes the facts: shard moves, the replacement of a dead node or primary, and the election of a new controller. The controller must stop acting when it cannot renew its lease, so for 20 minutes nothing changes, and a node that dies in that time stays dead.

::diagram{name="outage-paths"}

::diagram{name="generation-takeover"}

Some products can keep answering reads without a majority. Consul's stale mode works without a leader. ZooKeeper has a read-only mode, off by default, in which a server cut off from the majority serves reads to clients that ask for it ([ZooKeeper](https://zookeeper.apache.org/doc/current/zookeeperAdmin.html)). Both answer with data of unknown age, which suits routers and does not suit a decision to take a role.

When the service comes back, every client reconnects at once, and many reread all their data. The service must take this load, so clients reconnect after a random delay (more on [exponential backoff with jitter](../../fundamentals/networking/#when-a-call-fails)).

:::do
Design clients to keep working on their last known data when the service is down: cache it, keep it on disk, and do not tie each request to the service. Let writes continue only where the shard's replication protocol makes takeovers safe on its own; let changes of roles and placement wait for the service, and reconnect with backoff and jitter when it returns.
:::

:::avoid
Do not crash or restart a client when its connection to the service breaks or the service elects a new leader. Treat these events as a signal to check for changes, and treat a lost session as a lost role.
:::

## Picking a service, or none

The key-value store now keeps its shard map, node records, and controller election in a coordination service. The team still has to pick which one, or whether a separate service is needed at all.

Some systems no longer need ZooKeeper. Kafka moved its metadata to a group of its own controllers that run Raft, called KRaft, and Kafka 4.0, released in 2025, runs without ZooKeeper at all ([Kafka](https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/)). It saved running and securing a second system, and the disagreement between ZooKeeper and the controller's memory ([KIP-500](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)). ClickHouse ships ClickHouse Keeper, a Raft-based server in C++ that speaks ZooKeeper's client protocol and gives the same guarantees by default ([ClickHouse](https://clickhouse.com/docs/guides/sre/keeper/clickhouse-keeper)). Keeper replaces ZooKeeper but is still a consensus group to run, usually on its own servers. Use the coordination that your system ships with.

Many systems need no separate service at all:

- On Kubernetes, use its Lease objects. Kubernetes itself elects the leaders of its controller manager and scheduler with them, and your own workloads can do the same ([Kubernetes](https://kubernetes.io/docs/concepts/architecture/leases/)), usually through client-go's leader election. A Lease is an object that clients renew and read, not a key the server deletes, and client-go says that its election does not guarantee a single acting leader ([client-go](https://pkg.go.dev/k8s.io/client-go/tools/leaderelection)): fence the work when two leaders would corrupt data.
- When the work happens in one database, coordinate in that database. A row with a version gives compare-and-set, and an advisory lock in PostgreSQL taken with `pg_advisory_xact_lock` lets one worker act (more on [advisory locks](../postgresql/#concurrent-writes-the-postgresql-way)). When the lock and all the protected writes share one transaction, a stale holder cannot commit after another has taken over. The database's own failover is the weak spot: advisory locks live in the memory of the primary and are not copied to standbys, so after a failover the old primary must be fenced off.
- When a rare double run only costs time, a Redis key with an expiry is enough (more on [locks in Redis](../redis/#letting-one-worker-act-at-a-time)).

A distributed SQL database that the system already uses can hold such rows too, if its latency and conditional transactions meet the need; etcd's docs argue that waits on clocks and longer transactions make such databases a weaker fit for coordination ([etcd](https://etcd.io/docs/v3.7/learning/why/)). Pick a coordination service when you need its watches, keys tied to a live owner, and a cluster that does not share load with user data.

When it is needed, the three products differ in the details:

| | etcd | ZooKeeper | Consul |
|---|---|---|---|
| Data | flat keys, ranges, old versions | tree of znodes | keys by path, plus a service catalog |
| Default reads | linearizable | from the server you are connected to, may be behind | from the leader, rarely stale |
| Changes | stream from a revision, no gaps within the kept history | one-time or persistent watches | blocking queries |
| Liveness | leases with TTL | sessions | sessions tied to health checks or a TTL |
| Several keys at once | `If` / `Then` / `Else`, 128 operations by default | `multi`, about 1 MB | transaction, 64 operations |
| Election and locks | built-in APIs | recipes, usually Apache Curator | sessions with `acquire` |
| License | Apache 2.0 | Apache 2.0 | Business Source License from 1.17 |

etcd is the default for a new system. It has the cleanest model for metadata: reads at a revision, watches without gaps, and linearizable reads with no extra step. Kubernetes runs on it, so many teams already operate it. Do not put your own data into the etcd of a Kubernetes cluster: Kubernetes needs that cluster stable and recommends dedicated machines for it ([Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)). Run a separate one.

ZooKeeper fits when the systems you run already need it, such as HBase, or when a team on the JVM wants Curator's ready recipes. Remember that its reads can be stale.

Consul fits when you need service discovery anyway: health checks, DNS, a catalog per datacenter. Its key-value store and sessions then come for free (more on [service discovery](../../fundamentals/networking/#finding-the-server)). <!-- link: patterns/service-discovery --> Since version 1.17, Consul is under the **Business Source License** (BSL). It allows production use, including inside a company, but not offering Consul to others as a paid hosted or embedded product that competes with IBM's paid versions. Each version moves to the open-source MPL 2.0 license four years after its release ([Consul license](https://github.com/hashicorp/consul/blob/main/LICENSE)). For a company that runs Consul for itself, nothing changes; a company that sells a platform built around it needs a lawyer.

:::do
First use what you already run: the coordination your system ships with, such as Kafka's KRaft or ClickHouse Keeper in place of ZooKeeper, Kubernetes Leases, your database, or a Redis key for locks that only save work. When you need a separate service, pick etcd on its own 3 or 5 machines; pick ZooKeeper when your systems already depend on it, and Consul when you need its service discovery too.
:::

:::explain
When a design needs a leader, a lock, or a shard map, name a coordination service such as etcd or ZooKeeper on 3 or 5 nodes. Say what goes into it, small metadata that changes rarely, and what stays out. Say that clients cache what they read and follow changes with watches, that the leader gets a fencing token, and that during an outage of the service existing requests continue only while the storage's own replication protocol keeps takeovers safe, and changes of placement wait.
:::

::mark-as-read

## Cheat sheet

- A coordination service keeps the small facts that every server must agree on: the shard map, which nodes are alive, who leads, shared configuration. It runs one consensus group of 3 or 5 nodes, each with a complete copy of the data, and adds keys tied to a live owner, notifications, and a counter of changes. Values stay in kilobytes and all data fits one member with room to spare; user data stays in the database, and clients cache what they read.
- ZooKeeper keeps a tree of znodes, etcd flat keys read by ranges, Consul keys by path next to a service catalog. Each key has its own version, and each change gets a number from one counter: the zxid, the revision, or Consul's change number. Give each fact that changes on its own its own key under a common prefix; etcd reads a prefix at one revision.
- Change keys with compare-and-set on the version you read, and retry with a fresh read. A timed-out write may have been applied: never retry it blindly, and write a receipt key with an operation ID in the same transaction when you must know whether it ran. Put checks and writes that must happen together in one transaction (etcd `If` / `Then` / `Else`, ZooKeeper `multi`, Consul transactions of up to 64 operations), and order larger changes so every state in between is valid. ZooKeeper readers need a marker such as `ready`, changed by one writer and watched by readers, to avoid half a change.
- An ephemeral key disappears when its owner stops sending heartbeats: a ZooKeeper ephemeral znode on a session, an etcd key on a lease, a Consul key held by a session with the delete behavior. The servers decide the expiry; Consul's default gossip check follows the machine, not the process. Set the timeout above the longest pause you measured, stop sending work to a lost node at once, and rebuild its data only after it stays away.
- Follow changes instead of polling: ZooKeeper watches fire once and carry no value, or persist over a subtree since 3.6; etcd watches stream every change from a revision while it is in the history; Consul blocking queries return the whole result when it changes. Read, then watch from that point. Notifications can be late, so receivers check the version of the data the sender used.
- Elect a leader with a race for one ephemeral key, or with a queue where each candidate watches the one before it, to avoid the herd effect. Use the product's election API or a library such as Apache Curator. Elect one controller and let it assign the many smaller roles.
- A paused leader can act after it lost its role. Make its writes to the service conditional on its election key in the same transaction, and send a fencing token with its work outside: the create revision in etcd, the `czxid` in ZooKeeper, `LockIndex` of a never-deleted key in Consul. Receivers store the largest token durably. A lock alone protects only work where a double run costs time.
- Reads served by one server may be stale. etcd reads are linearizable by default; ZooKeeper reads are local, `sync` narrows the gap, and only a write before the read closes it; Consul's default reads are rarely stale, consistent reads never, and stale reads are fast and work without a leader. Pay for a fresh read only where a decision depends on the latest change.
- More voting servers slow writes. Run 3 or 5 voters, and scale reads with ZooKeeper observers, reads from any server, etcd's gRPC proxy, and client caches. Keep one session per process and spread restarts; with thousands of clients, let one component read the service and publish to the rest.
- Every write waits for a disk sync on a majority, and slow syncs cost the leader its role. Give the service its own machines or disks with SSDs and no swap, watch sync times and leader changes, and tune heartbeat and election timeouts from measured round trips.
- etcd keeps old versions until a history compaction, which is off by default in the server; defragmentation returns the space to the disk, one member at a time; at its quota, 2 GiB by default, etcd accepts only reads and deletes. ZooKeeper keeps old snapshots and logs until purging is turned on. Back up ZooKeeper snapshots with the logs they need, restore etcd with `--bump-revision` and `--mark-compacted`, and keep values that change every few seconds out.
- Replace a dead member by removing it first and adding the new one second, one at a time. In etcd, add new members as learners that do not vote until promoted; ZooKeeper changes members at runtime only when turned on; Consul's Autopilot removes dead servers when cleanup is on. Only a majority lost for good means a new cluster from a snapshot.
- Turn on access control and TLS: ZooKeeper access lists per znode, not inherited; etcd roles over key ranges; Consul tokens with policies and a `deny` default policy, plus its gossip key. Give each client the narrowest rights.
- A cluster across regions pays a round trip between regions for every write. Run one service per region for that region's metadata, serve far readers with non-voting servers or proxies, and keep a cluster across three regions only for the few global facts that must survive a region loss.
- The service goes down too. Keep it out of the path of each request and let clients work on cached data. Writes continue only where the shard's replication protocol makes takeovers safe on its own: a generation number stored by a majority, recovery of acknowledged writes, and safe changes of replicas; changes of roles and placement wait. Do not crash on a lost connection or a new leader, and reconnect with backoff and jitter.
- First use what you already run: what your system ships with, such as Kafka's KRaft or ClickHouse Keeper, Kubernetes Leases, your database, or a Redis key for locks that only save work; fence the work where two leaders would corrupt data. For a separate service, pick etcd by default, ZooKeeper when your systems already need it, and Consul when you need its service discovery; Consul 1.17 and later are under the Business Source License, which forbids only competing paid offerings.

## Sources

- Unmesh Joshi. [Patterns of Distributed Systems](https://martinfowler.com/books/patterns-distributed.html). Addison-Wesley, 2023. "Consistent Core", "Lease", and "State Watch".
- Martin Kleppmann, Chris Riccomini. [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/), 2nd edition. O'Reilly, 2026. Chapter 10.
- Mike Burrows. [The Chubby lock service for loosely-coupled distributed systems](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/). OSDI, 2006.
- Patrick Hunt, Mahadev Konar, Flavio Junqueira, Benjamin Reed. [ZooKeeper: wait-free coordination for Internet-scale systems](https://www.usenix.org/legacy/event/atc10/tech/full_papers/Hunt.pdf). USENIX ATC, 2010.
- Colin McCabe. [KIP-500: Replace ZooKeeper with a self-managed metadata quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum). Apache Kafka, 2019.

::mark-as-read
