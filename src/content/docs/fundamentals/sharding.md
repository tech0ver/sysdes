---
title: Sharding
description: How to split data across nodes, from shard keys, ranges, and hashes to rebalancing, hot tenants, hot keys, and queries that span shards.
---

Almost every large system splits its data across nodes once one database can no longer take the writes or hold the data. To defend a design, you need to know which key splits the data, how keys find their nodes as the fleet grows, and what happens when tenants, keys, or queries do not fit that split.

## Outgrowing one node

A task tracker for companies runs on one database. Each company has a workspace with projects, tasks with attached files, comments, and an activity log of every change. Reads go to followers, writes go to the leader.

As the number of companies grows, two things grow that followers cannot take over: the writes, because every follower repeats them, and the data, because every follower stores all of it. At peak hours the leader runs out of CPU and disk I/O, and its disk keeps filling. Before splitting the data, try the cheaper steps:

1. **Vertical scaling**: move the leader to a bigger machine. The code does not change, and one machine goes a long way today. But the largest machine is a hard ceiling, and work on one huge database gets slow: backups, restores, new indexes, and cleanup of old row versions can take hours.
2. Serve more reads from followers and a cache, so the leader spends its capacity on writes. <!-- link: fundamentals/caching -->
3. Keep less data on the leader: move old rows, such as activity older than a year, to cheaper storage.
4. **Functional partitioning**: move whole features to their own databases. Billing and notifications each get a database, files go to [object storage](../databases/#storing-files), and full-text search goes to a search engine. Each database is smaller and can be tuned for its load. The price is that joins and transactions no longer cross these databases.

::diagram{name="functional-partitioning"}

Figma started in 2020 on one PostgreSQL database on the largest instance AWS offered. By the end of 2022 it had added caching, read replicas, and about a dozen databases split by function, and some tables had still grown to several terabytes and billions of rows ([Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

:::interview
Name the three ways to scale from the [AKF scale cube](https://akfpartners.com/growth-blog/scale-cube): clone the whole system (X axis: more copies behind a load balancer, or followers), split it by function (Y axis: separate services and databases), and split it by a key such as the customer (Z axis: each copy holds part of the data). X and Y are cheaper, so they come first. <!-- link: patterns/scaling -->
:::

:::do
Take the cheaper steps first. Split a table across machines only when an estimate of growth shows that its writes or its size will outgrow the largest machine you are willing to run. <!-- link: fundamentals/requirements -->
:::

None of these steps splits a table, so the largest table still has to fit on one node.

## Splitting a table across nodes

The tasks table takes more writes than the largest leader can apply, and its data no longer fits one disk. The table has to live on several machines at once.

**Sharding** splits the rows of one table across nodes. Each part is a **shard**, and each row lives in exactly one shard. A shard works like a small database of its own: it has its own leader and followers, so sharding and replication combine. One node usually holds several shards, as the leader of some and a follower of others. Products call a shard a partition, a range (CockroachDB), a region (HBase), a tablet (Bigtable), or a token range (Cassandra).

::diagram{name="shards-on-nodes"}

Sharding is **horizontal scaling**: capacity grows by adding machines, not by buying a bigger one. Ten shards on ten nodes can take about ten times the writes and the data of one node, if the load spreads evenly.

The price: something must find the shard of each row, and the rule that picks it is hard to change later. A query that cannot name the shard has to ask every shard. A transaction that touches two shards is no longer a single-node transaction. Adding nodes means moving data while the app keeps running.

:::distinguish
Partitioning inside one database splits a table into parts on the same machine, as PostgreSQL does with table partitions by month. It makes deleting old data cheap, but it adds no capacity. Sharding puts the parts on different machines. Many products use "partition" for both.
:::

Moving data to new shards needs spare capacity on the old node. Notion waited until its one PostgreSQL database was close to its limits, and wrote that this forced the migration itself to add as little load to it as possible ([Notion blog, 2021](https://www.notion.com/blog/sharding-postgres-at-notion)).

:::do
Start sharding while the leader still has spare capacity, well before it is overloaded. Plan the split from an estimate of growth, so the migration has capacity to copy data while users keep working.
:::

The first choice is the column that picks a row's shard.

## Choosing the shard key

The tracker serves a few kinds of requests, from most to least frequent:

1. Open a project board: the tasks of one project.
2. Open a task with its comments.
3. Write a change to a task and its activity entry, in one transaction.
4. List the overdue tasks of a workspace.
5. Log in by email.
6. Build an admin report over all workspaces.

The **shard key** is the column whose value picks the shard. Rows with the same value land in the same shard. A query that names the value goes to one shard; a query without it goes to all of them. Wide-column stores call the same idea the partition key.

The key decides which requests stay on one shard. Sharding by task ID spreads the tasks of one board over every shard, so opening a board asks all of them. Sharding by user ID scatters a workspace over many shards, because its tasks belong to many users. Sharding by workspace ID keeps the first four requests on one shard, since each of them stays inside one workspace. Only login and the admin report cross shards.

::diagram{name="shard-key-choice"}

```sql
SELECT id, title, status
FROM tasks
WHERE workspace_id = 42
  AND project_id = 7;
-- goes to the one shard that holds workspace 42
```

A good shard key has five properties:

- It is known in almost every request, from the URL or the user's session, so the app can route the request without a lookup.
- It has many distinct values. A key with 7 values, such as a continent, can never use more than 7 shards.
- Its values carry similar amounts of data and load, so no single value fills a shard.
- It keeps transactions on one shard: the rows a transaction changes together share the key.
- Its value does not change for a row, since a new value means moving the row to another shard.

All tables of a workspace carry the key, comments and activity entries included, even when they could find it through the task. Then the rows that queries read together are stored together on one shard. This is **co-location**. Joins and transactions inside one workspace stay local. The primary key includes the shard key, because a unique check can only run inside one shard. Small tables that every workspace reads, such as pricing plans, are copied to every shard. Every change to them is written to every shard, so keep them small and rarely changed.

```sql
CREATE TABLE comments (
  workspace_id bigint,
  id           bigint,
  task_id      bigint,
  body         text,
  PRIMARY KEY (workspace_id, id)
);
```

::diagram{name="co-location"}

Notion sharded its PostgreSQL database by workspace ID for the same reason: each piece of content (a block, in Notion's terms) belongs to one workspace, and users work inside one workspace at a time ([Notion blog, 2021](https://www.notion.com/blog/sharding-postgres-at-notion)). A large app may need more than one key: Figma shards some groups of tables by user, others by file or organization, and supports joins only inside a group that shares a key ([Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

Changing the shard key later means moving every row to a new place, so choose it from the queries before the data grows.

:::tradeoff
A tenant key keeps a customer's requests and transactions on one shard. In return, one customer must fit one shard: a customer that grows far bigger than the rest overloads its shard.
:::

:::do
List the most frequent queries and the writes that must be atomic, then pick the column they share. In a multi-tenant app this is usually the tenant ID. Avoid keys with few values or with one value much larger than the rest.
:::

The key groups rows, but the database still needs a rule that maps its values to shards.

## Splitting by key ranges

The simplest rule gives each shard a range of key values, like the volumes of an encyclopedia: workspaces 1 to 4,000 on the first shard, 4,001 to 9,000 on the second, and so on. This is **range partitioning**. A small table of boundaries tells which shard owns a value. Inside a shard, rows stay sorted by the key, so a query over a range of keys reads one shard or a few neighbors.

The boundaries follow the data: a range with a few big workspaces is narrower than a range with many small ones. When a range grows past a size limit, the database splits it in two and can move one half to another node. Small neighbors merge back. Bigtable, HBase, CockroachDB, and MongoDB with a ranged shard key do this on their own: Bigtable keeps tablets at about 100 to 200 MB, and one node holds ten to a thousand of them ([Bigtable paper, 2006](https://static.googleusercontent.com/media/research.google.com/en//archive/bigtable-osdi06.pdf)). Some databases also split a range that takes too many requests, even when it is small.

::diagram{name="key-ranges"}

A new table starts as one range on one node and takes all writes there until it grows and splits. If you know how the keys will spread, create the boundaries before a bulk load. Moving half of a range means copying its data, and the shard that needs a split is usually the busiest one already.

Keys written in order defeat ranges. Say the activity log is keyed by time alone, so the last hour of activity is one range read. Every new entry carries the newest time, so all writes go to the last range on one shard, while the other shards sit idle. More shards do not help, because there is always only one newest range. Auto-increment IDs do the same: every new workspace starts on the last shard.

The fix is to put another field before the time: key the log by `(workspace_id, created_at)`. Writes now spread over the ranges of all active workspaces, and one workspace's activity for a week is still one range read. The cost: the last hour of activity across all workspaces becomes one range read per workspace. And the writes spread only while many workspaces are active at once.

::diagram{name="ordered-writes"}

:::avoid
Do not start a range key with a timestamp or an auto-increment ID. Every new row goes to the last range, and one shard takes all the writes.
:::

:::tradeoff
Range partitioning keeps nearby keys together, so range reads are cheap. In return, the boundaries must follow the data, and keys written in order pile up on one shard.
:::

When no field can go first, as with the workspace ID itself, keys that arrive in order need a placement that ignores their order.

## Splitting by hash of the key

**Hash partitioning** puts the key through a hash function and places the row by the hash. Neighboring keys get unrelated hashes, so workspaces 41 and 42 land on different shards, and new workspaces spread over all shards from the first day. No one has to choose boundaries from the data. The simplest mapping takes the remainder: shard = hash(key) mod N, where N is the number of nodes, one shard per node.

::diagram{name="range-vs-hash"}

The hash function must give the same result in every process, on every machine, and after every upgrade, or a row is looked up in the wrong place. Use a stable function such as MurmurHash3 or MD5; it does not need to be cryptographic. A language's built-in hash, such as Java's `Object.hashCode()`, can differ between processes.

Hashing loses key order: hashes of neighboring keys are scattered, so a query over a range of the hashed column asks every shard. For a tenant key this rarely matters: no request reads workspaces 100 to 200. A composite key keeps order where it matters: hash only the shard key, here the first column, and sort the rows inside the shard by the rest. With the key `(workspace_id, created_at)`, hashing `workspace_id` spreads the workspaces, and one workspace's activity for a week is still one range read on one shard. Wide-column stores work this way: they hash the shard key, which they call the partition key, and the clustering key sorts the rows inside it.

Figma routes by a hash of the shard key, because its IDs grow with time and would have sent all new rows to one shard. Range reads over those keys got slower, which was fine, since its code rarely makes them ([Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

:::do
Hash the key when requests look up one key value at a time, as with a tenant ID. Use ranges when the main queries read runs of sorted keys, and then put a field that spreads the writes first. In a composite key, hash only the columns that pick the shard and keep the rest sorted.
:::

With N in the formula, adding a node moves almost every key to another shard.

## Adding nodes without moving every key

The tracker runs on four nodes with shard = hash(workspace_id) mod 4, and a fifth node arrives. With mod 5, a key stays where it was only if both remainders match, which holds for one key in five. So 80% of the data moves, while 20% would be enough to fill the new node. Going from N to N + 1 nodes moves about N/(N + 1) of the keys, and the copy loads every node and the network while the app keeps running.

The fix separates two mappings. Pick a fixed number S of **logical shards**, many more than nodes: for example, 1,000 shards on 10 nodes, 100 per node. A key maps to a shard by hash(key) mod S, and S never changes. A small map, stored apart from the data, assigns each shard to a node. Adding a node moves whole shards to it, a fair share from each old node, and changes only the map. A whole shard is easy to move: copy its database or its files, without picking rows one by one. A bigger machine can hold more shards.

::diagram{name="mod-n-vs-logical"}

Pick S with many divisors, so the shards spread evenly over many fleet sizes. Notion split its PostgreSQL data into 480 logical shards on 32 nodes, 15 per node: 480 divides evenly over 32, 40, or 48 nodes, while 512 would have forced the fleet to double to 64 ([Notion blog, 2021](https://www.notion.com/blog/sharding-postgres-at-notion)). In 2023 it moved to 96 nodes with 5 shards each and kept all 480 shards ([Notion blog, 2023](https://www.notion.com/blog/the-great-re-shard)).

A fixed count caps the fleet: there can be no more nodes than shards. Each shard grows with the data: a large shard moves and recovers slowly, and many small ones add overhead per shard. A wrong S means resharding: splitting every shard, which is slow and needs extra disk. So choose S from a growth estimate a few years ahead.

Some databases let the count adapt instead: shards own ranges of keys or of hash values and split when they grow too big or too busy, as with key ranges. DynamoDB, CockroachDB, and MongoDB work this way. The count follows the data, at the cost of splits that run under load and a map that changes all the time.

:::avoid
Do not place keys by hash mod the number of nodes in a store that will grow. Each new node moves most of the data.
:::

:::do
Hash keys into a fixed number of logical shards, many more than nodes, and keep a map from shard to node. Pick a count with many divisors that is still enough for the largest fleet you expect.
:::

## Placing keys without a central map

The tracker also keeps a cache cluster in front of the database. App servers pick a cache node for each key themselves, with no map to ask. With hash mod N, adding one cache node would send most keys to a node that does not have them, and all those misses would hit the database at once.

**Consistent hashing** places nodes and keys on the same ring of hash values. A node takes its position from a hash of its name, a key from a hash of the key, and a key belongs to the first node clockwise from it. A new node takes only the keys between itself and the node before it: about 1/N of the keys move, all from one neighbor. A removed node hands its keys to the next one. Every client that knows the list of nodes computes the same placement.

With one position per node, the arcs between nodes come out uneven, a new node relieves only one neighbor, and a failed node drops its whole load on the next one. **Virtual nodes** fix this: each node takes many positions on the ring. The arcs even out, a new node takes a little from every node, the load of a failed node spreads over the rest, and a bigger machine gets more positions. The price is a larger ring to keep in memory. Cassandra used to need 256 random positions per node for an even spread and now reaches it with 16 by choosing them with care ([Cassandra docs](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)).

::diagram{name="ring-vnodes"}

Other schemes keep the same property without a ring: rendezvous hashing sends a key to the node with the highest hash of the pair (key, node), and jump consistent hash computes a shard number with no stored state at all.

Consistent hashing fits where no central map exists and clients compute placement: client-side caches and leaderless stores such as Cassandra. Databases with a coordinator usually prefer logical shards and a map, which let them move any shard to any node. Amazon's Dynamo started with random positions on the ring and moved to a fixed set of equal partitions. With random positions, a new node took over ranges whose owners had to scan their data to hand them over, and adding a node in the busy shopping season took almost a day ([Dynamo paper, 2007](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)).

:::distinguish
"Consistent" in consistent hashing means only that few keys move when the nodes change. It has nothing to do with the consistency of replicas or transactions.
:::

:::interview
Asked how to add nodes, name consistent hashing with virtual nodes for a cache or a leaderless store. For a database, name fixed logical shards with a map, and mention the ring as the scheme many interviewers expect to hear.
:::

## Finding the shard for a request

A request to open board 7 of workspace 42 reaches an app server. Something must turn the workspace ID into the address of the node that holds its shard, and that answer changes every time a shard moves. There are three places to put this logic:

- In the client: a library inside the app computes the shard, looks up its node in the map, and connects to it directly. This adds no extra hop, but every app instance must keep a fresh copy of the map, and every language the team uses needs the library.
- In a routing tier: a shard-aware proxy that holds no data sits between the app and the shards, and the app talks to it as to one database. Clients stay simple, and the proxy can also merge the results of a query that spans shards. The price is an extra hop and one more tier to run and scale. MongoDB's mongos works this way.
- In any node: the request goes to any node of the database through a load balancer, and that node serves it or forwards it to the owner. Clients know nothing, at the cost of an extra hop inside the cluster. CockroachDB works this way.

Whichever place does this work is the router.

::diagram{name="routing-options"}

Figma built its own routing tier: a proxy parses each SQL query, finds the logical shards it touches, and rewrites it for the databases that hold them. A change of the shard map reaches the proxy in under a second ([Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

The shard can be computed from the key, as with logical shards, or looked up per key in a **shard directory**: a table that maps each tenant to its shard. A directory lets you place a new tenant on the emptiest shard, move one tenant at a time, and give a big tenant a shard of its own. In return, every request needs a lookup, and the directory becomes a critical dependency: when it is down, no request finds its data. Slack kept such a map from workspace to shard in a metadata cluster of its own ([Slack blog, 2020](https://slack.engineering/scaling-datastores-at-slack-with-vitess/)). A common middle ground computes the shard by default and keeps a small override table for the exceptions.

::diagram{name="shard-directory"}

The authoritative map lives in a small store that agrees on changes through consensus, such as ZooKeeper, etcd, or MongoDB's config servers. <!-- link: fundamentals/consistency --> Routers cache the map and get notified when it changes. A router can still send a request by an old map to a node that no longer owns the shard. To catch this, each version of the map gets a number: the node rejects a request made with an older version, and the router fetches the new map and retries.

::diagram{name="stale-map"}

A cache in front of the map hides its load until the cache empties. In DynamoDB, request routers cached the routing data of a whole table and almost never missed, but freshly started routers sent every request to the metadata service at once. DynamoDB changed them to fetch only the entries they need and to refresh cached entries in the background, so the metadata service sees the same load whether the cache is warm or cold ([DynamoDB paper, 2022](https://www.usenix.org/system/files/atc22-elhemali.pdf)).

:::tradeoff
A shard directory gives control over where each tenant lives. In return, every request depends on a lookup, and the directory has to stay available and correct while tenants move.
:::

:::do
Use the routing your database provides. When you shard in the app, start with a client library, and move to a routing tier when several services or languages use the data or queries need merging across shards. Compute the shard from the key, and keep a directory or an override table only for the tenants you need to place by hand. Keep the map in a store built on consensus, cache it in the routers, and check its version on every request.
:::

## Moving data between nodes

A new node starts empty. Over time, shards also drift apart: new workspaces land on whatever shard the rule gives them, and workspaces grow at different rates. Shopify found its busiest shard used almost four times the resources of its least busy one ([Shopify blog, 2021](https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale)).

**Rebalancing** moves shards between nodes so that data and load spread evenly again: onto a new node, off a node that is leaving, away from a node that runs hot, or together when several shards sit almost idle. Choose the moves from measured load: counts of shards or tenants per node mislead, since tenants differ in size. Stripe merged underused shards in 2023, moved 1.5 PB of data, and cut its number of shards by about three quarters ([Stripe blog, 2024](https://stripe.dev/blog/how-stripes-document-databases-supported-99.999-uptime-with-zero-downtime-data-migrations)).

One move works like starting a new follower, with a switch at the end (more on [how a new copy catches up](../replication/#starting-a-new-copy)):

1. Copy a snapshot of the shard to the new node, while the old node keeps serving reads and writes.
2. Stream the changes made since the snapshot until the copy is seconds behind, and check that the copies match at the same point in time.
3. Stop writes to the shard for a moment, apply the last changes, and switch the shard map to the new node.
4. Stream changes back to the old copy for a while, so the map can switch back without losing writes, then delete the old copy.

::diagram{name="shard-move"}

The write pause is the only moment users can notice. Stripe switches a shard in under 2 seconds, and requests that fail during the switch succeed on retry ([Stripe blog, 2024](https://stripe.dev/blog/how-stripes-document-databases-supported-99.999-uptime-with-zero-downtime-data-migrations)). With a shard directory, the same steps move a single tenant, with its directory entry in place of the shard map. Shopify moves shops between shards with a copy, a catch-up, and a short write pause. <!-- link: patterns/data-migration -->

A move adds load: the old node reads and sends the whole shard, the network carries it, and the new node writes it. Some databases rebalance on their own, which saves work but can make an overload worse. A node under heavy load answers slowly, failure detection declares it dead, its shards move to other nodes, and those nodes overload in turn. So many systems propose a plan and let a person approve it, and teams move shards ahead of known peaks such as a big sale.

::diagram{name="overload-spread"}

:::do
Move whole shards and choose the moves from measured load. Let the database move shards for size on its own, but have a person approve moves under heavy load, and schedule big moves before known peaks. Keep the write pause shorter than the time clients spend on retries, and keep the old copy receiving changes until the new one has proved itself.
:::

Moving whole shards cannot help when one tenant alone fills a shard.

## One tenant bigger than the rest

An enterprise customer signs up with tens of thousands of users. Its workspace grows to hundreds of times the size of a typical one, and its shard runs out of CPU while the other shards sit half idle. Hashing spread the workspaces evenly, but it cannot split one workspace: all its rows share one key value.

**Skew** is an uneven split of data or load across shards, and a shard that gets far more load than the rest is a **hot shard**. A tenant key makes skew likely, because tenant sizes are very uneven. Citus estimates that the largest of 100 tenants holds about 20% of all data, and the largest of 10,000 still holds about 2% ([Citus docs](https://docs.citusdata.com/en/latest/use_cases/multi_tenant.html)). Slack sharded by workspace and found that its largest customers outgrew the biggest machine a shard could run on, while big enterprise teams made hot shards and most of the fleet stayed underused ([Slack blog, 2020](https://slack.engineering/scaling-datastores-at-slack-with-vitess/)).

There are three ways to handle a big tenant:

1. Give it a shard of its own. Move the tenant to a new shard on its own node and point its entry in the shard directory there. Its load no longer slows the others, and theirs no longer slows it. This works while the tenant fits one node. Stripe moves its largest users from shared shards to dedicated ones ([Stripe blog, 2024](https://stripe.dev/blog/how-stripes-document-databases-supported-99.999-uptime-with-zero-downtime-data-migrations)).
2. Split it by a second key. The shard key of its data becomes the pair `(workspace_id, project_id)`, so its projects spread over several shards. Requests inside one project still go to one shard. In return, a report over the whole workspace asks all of its shards, and a transaction that spans two projects spans two shards. Slack moved to finer keys, such as the channel ID for messages, to spread its largest customers ([Slack blog, 2020](https://slack.engineering/scaling-datastores-at-slack-with-vitess/)).
3. Limit it. Cap each tenant's data size and request rate by plan, so that one tenant cannot fill a shard by surprise. <!-- link: patterns/rate-limiting -->

::diagram{name="big-tenant-options"}

Each of these needs numbers per tenant: data size, requests, and CPU time by tenant ID. Notion found, after spreading its load over three times as many nodes, that a few workspaces still put an outsized load on their shards ([Notion blog, 2023](https://www.notion.com/blog/the-great-re-shard)).

:::do
Track size and load per tenant. Move a tenant to its own shard when it takes a large share of a shared one, and split a tenant by a finer key only when it outgrows one node.
:::

## Dedicated or shared storage per tenant

A bank signs up and demands that its data sit in a database no other customer uses, that the database stay in the EU, and that it can be restored on its own. Until now, all workspaces shared the same tables.

SaaS products choose from three models of storage per tenant:

- In the **pool model**, all tenants share databases and tables, and the tenant ID in every row tells their data apart. This is the design so far.
- In the **bridge model**, tenants share a database, but each gets its own database schema or its own set of tables.
- In the **silo model**, each tenant gets a database of its own.

::diagram{name="tenant-storage-models"}

A shared database has a **noisy neighbor** problem: one tenant's heavy load slows every tenant on the same node. A silo removes it and gives more: an outage or a bad schema change hits one tenant, a tenant can be backed up, restored, or deleted on its own, its database can run in the region its data must stay in, and schema changes can roll out one tenant at a time. The costs: creating a tenant means creating a database, the team runs and upgrades many databases instead of a few, each one keeps spare capacity of its own, and a view across all tenants has to collect data from all of them. Cost is usually the largest of these.

The pool is the opposite: a new tenant is a new ID, one fleet serves everyone at a lower cost, and one change upgrades all tenants. In return, an outage or a bad migration hits everyone, and noisy neighbors need limits. The bridge sits in between: it suits fewer, larger tenants, or tenants that need tables of their own. Each schema change then runs once per tenant, and the database's limit on the number of tables caps the tenant count. Citus suggests a database schema per tenant for up to about 10,000 larger tenants and shared tables for many small ones, up to millions ([Citus blog, 2023](https://www.citusdata.com/blog/2023/07/18/citus-12-schema-based-sharding-for-postgres/)).

Sharding works with all three. A silo is a shard with one tenant, and the shard directory points pooled tenants to shared shards and the bank to its own database, so one routing layer serves both. Moving a tenant from the pool to a silo is a tenant move, with its copy, catch-up, and switch.

A step further, the whole system splits into cells: each cell runs the full stack for a group of tenants, from app servers and caches to databases, so a failure or a bad deploy stays inside one cell. Shopify runs pods this way: each pod is a separate copy of Shopify with its own MySQL shard and caches, serving a subset of shops ([Shopify blog, 2021](https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale)). <!-- link: fundamentals/failures -->

::diagram{name="cells"}

:::avoid
Do not count on a separate database to keep tenants apart. Code that opens the wrong connection still reads another tenant's data; every request still needs a check of which tenant it may access. <!-- link: fundamentals/security -->
:::

:::do
Start with the pool and move a tenant to a silo only for a clear requirement: compliance, data residency, or a customer who pays for a database of its own. Offer silos as a higher plan, and place both kinds through the same shard directory.
:::

## One key with too much traffic

Even after the enterprise workspace is split by project, one project serves the whole company: everyone opens its board in the morning, and every change to it adds an entry to the activity log. All of it goes to one key, `(workspace_id, project_id)`, and so to one shard, while neighboring shards stay quiet.

A **hot key** is one key value that gets more traffic than a whole shard can serve, even with the shard to itself. Adding shards does not help, because the key still lives on one of them, and neither does moving shards. Databases that split a busy range by load, such as DynamoDB and CockroachDB, cannot split one key ([CockroachDB docs](https://docs.cockroachlabs.com/docs/stable/load-based-splitting)). Each shard also has a hard limit: one DynamoDB partition serves up to 1,000 writes of 1 KB per second ([DynamoDB docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)).

For writes, split the hot key into many keys. **Salting** adds a suffix to the key: project 7 of workspace 42 becomes `(42, 7, 0)` to `(42, 7, 99)`, and each write picks a suffix, so the writes spread over up to 100 shards. A random suffix spreads best, but then no one knows where a given row is. A suffix computed from another field, such as the task ID mod 100, still spreads the writes and lets a request for one task go to one shard. Either way, reading the whole project means reading all 100 keys and merging the results. So salt only the few keys that need it, and keep a list of which keys are split, since a key that is hot today may be quiet next month.

::diagram{name="salting"}

For reads, salting does not help, since every read would ask all the suffixes. Put a cache in front of the hot key, or add followers to its shard, so that many copies share the reads. <!-- link: fundamentals/caching -->

:::distinguish
A hot shard carries more load than the rest, but each of its keys fits one shard, so moving keys away or splitting the shard helps. A hot key alone needs more than one shard can give: only a finer key or more copies of it help.
:::

:::do
Track traffic per key to find hot keys. Serve hot reads from a cache or extra followers, and salt a key only when its writes exceed what one shard can take.
:::

## Querying without the shard key

The product team wants a report of the 20 users who closed the most tasks this month. A user can work in several workspaces, so the query names no workspace, and no single shard can answer it.

**Scatter-gather** sends the query to every shard, lets each run it on its own rows, and merges the results in the router. It has three costs.

First, every shard does the work for every such query. Adding shards makes each one smaller, but a query that runs on all of them gains no throughput: MongoDB notes that such queries do not scale as shards are added ([MongoDB docs](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/)).

Second, the slowest shard sets the latency. If each shard is slow one time in a hundred, a query that waits for 100 shards is slow 63% of the time (1 − 0.99<sup>100</sup>). Google measured a 99th percentile of 10 ms for one node's answer and 140 ms for all nodes to answer the same request. A hedged request, a second copy of a slow request sent to another replica, cut the 99.9th percentile of a read of 1,000 values from 1,800 ms to 74 ms, at the cost of 2% more requests ([The Tail at Scale, 2013](https://www.barroso.org/publications/TheTailAtScale.pdf)).

::diagram{name="scatter-gather"}

Third, the merge is not always simple. Each shard's top list is not the global one. If each shard returns only its top user, one shard returns a user with 16 closed tasks, while a user with 12 on one shard and 11 on another, 23 in total, appears in neither list. Sums and counts add up, but medians, percentiles, and counts of distinct values do not. Sorting and paging need every shard to return all rows up to the end of the page. And when one shard is down, the query either fails or returns a partial answer, and the code must choose which.

::diagram{name="top-n-merge"}

A join between tables sharded by different keys also needs rows from many shards. There are four ways out: give the tables the same key (co-location), copy small tables to every shard, join in the app (read IDs from one table, then fetch the other table's rows by its key), or keep a copy of the data shaped for the read and sharded by its key.

Figma's routing tier runs scatter-gather only for the query shapes it supports. The team chose them by logging the plans of live queries and checking which ones the sharded setup could serve: they covered about 90% of common queries, and the rest were rewritten in the app ([Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

:::do
Keep scatter-gather off the paths users wait on, and use it only for rare queries. When one must stay on such a path, send hedged requests to cut the wait for slow shards. Serve reports over all tenants from an analytics copy that collects data from every shard. <!-- link: fundamentals/data-processing -->
:::

A frequent query without the shard key, such as login by email, cannot afford to ask every shard.

## Finding records by another field

A user logs in with an email address. The request carries no workspace ID, and the user may belong to several workspaces. The email must also be unique across all users, while a unique check runs only inside one shard.

A secondary index over sharded data comes in two kinds:

- A **local index** lives on each shard and covers only that shard's rows. A write updates the index on the same shard, in the same transaction. A query that names the shard key uses one shard's index; a query without it goes to every shard, with all the costs of scatter-gather. MongoDB, Cassandra, and Elasticsearch work this way.
- A **global index** covers all rows and is itself sharded by the indexed value: the entries for one email sit on one index shard, whatever shard holds the user. A lookup reads one index shard and then fetches the rows from the shards that hold them. A write, though, touches two shards: the row's and the index entry's. Either a distributed transaction keeps them in step, which slows every write, or the index updates in the background and lags behind for a moment, like a follower. CockroachDB and TiDB keep their global indexes in step; DynamoDB updates its global indexes in the background, usually within a fraction of a second ([DynamoDB docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)).

::diagram{name="local-vs-global-index"}

Login fits a global index: a table from email to user ID, sharded by a hash of the email, and a table of each user's workspaces. Uniqueness works the same way: the index shard that owns an email is the one place that can say whether it is taken, so a new user claims the email there first. The tables of users and logins do not have to share the tenant key at all: they can form their own group with a key of their own.

IDs follow the same rule. An auto-increment counter on each shard repeats the numbers of the others, so IDs that must be unique everywhere need a generator that works across shards. <!-- link: patterns/unique-ids -->

:::tradeoff
A local index costs one shard on a write and every shard on a read without the shard key. A global index costs one index shard on a read, but every write touches a second shard, and the index either slows writes or lags behind them.
:::

:::do
Use local indexes for queries that also carry the shard key. Add a global index for frequent lookups without it, such as login, and plan for its lag if it updates in the background. For a value that must be unique across shards, write its index entry first or in the same transaction, never in the background.
:::

## Writing to several shards

A company merges two of its workspaces, and a project moves from one to the other. The workspaces live on different shards, so the move deletes rows on one shard and writes them on another. A transaction covers only one shard: if the process fails between the two writes, the project is lost or exists twice.

The cheapest fix is to avoid such writes. The shard key keeps the rows that change together on one shard, and a transaction there works as before. Notion and Figma both avoid transactions across shards and build around that ([Notion blog, 2021](https://www.notion.com/blog/sharding-postgres-at-notion), [Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

When a write must span shards, there are two tools:

- A distributed transaction with two-phase commit: every shard first prepares the change and promises to apply it, then all commit together. The write is atomic, but it costs extra round trips, holds locks across them, and a failed coordinator can leave the shards waiting. Distributed SQL databases run it for you.
- A saga: a chain of local transactions, one per shard, where each step has an undo step that runs if a later step fails. No locks span shards, but other requests can see the state between steps.

A rare move like the project's can also be made safe with steps that can repeat without harm: pause writes to the project, copy its rows under the new workspace ID as hidden, mark the old project as moved with one write on its shard, then show the new copy and delete the old rows. The mark decides which copy is real, and each step can run again after a crash, the way a tenant move works. <!-- link: fundamentals/consistency -->

::diagram{name="project-move"}

:::do
Choose the shard key so that writes that must be atomic stay on one shard. For a write across shards, use steps that are safe to repeat for moves, a saga when earlier steps may need undoing, and a distributed transaction only where the database provides it.
:::

## Picking a sharding scheme

The tracker now shards by workspace, places most workspaces by hash into a fixed set of logical shards, and keeps exceptions in a directory. Each scheme answers "how does a key find its shard" differently, and the rest follows:

| | Key ranges | Hash into logical shards | Consistent hashing | Shard directory |
|---|---|---|---|---|
| A key finds its shard by | a table of boundaries | hash mod S, then a map | the next node on the ring | a lookup per key |
| Spread of keys | follows the boundaries | even | even, with virtual nodes | as placed |
| Range reads over the key | one or a few shards | every shard | every shard | as placed |
| Keys written in order | one hot shard | spread | spread | as placed |
| Adding a node | split ranges and move halves | move whole shards | about 1/N of keys move | move chosen keys |
| Metadata | small, changes with splits | small, changes when shards move | nodes and their positions | an entry per key |
| Fits | range reads, time series | most databases, tenants | caches, leaderless stores | tenants placed by hand |

Ranges of hash values that split as they grow combine the spread of hashing with the way key ranges add nodes.

For a multi-tenant app the default combines them: shard by tenant ID, hash it into a fixed number of logical shards, keep the shard map in a store built on consensus, and add a directory or override table for the tenants placed by hand, such as the largest ones and the silos. Inside a tenant, keep rows sorted by a second column, so that reads over time stay range reads.

::diagram{name="default-design"}

Who builds the sharding is a separate choice. Many databases shard on their own: DynamoDB, Cassandra, MongoDB, distributed SQL databases, and Vitess or Citus on top of MySQL or PostgreSQL. Let one of them do it by default, with the tenant ID as its shard key; each runs its own form of the scheme. Shard in the app, as Notion and Figma did, when you need full control over the split or cannot risk moving off the database service you run today. Then the routing, the moves, and the map are yours to build ([Notion blog, 2021](https://www.notion.com/blog/sharding-postgres-at-notion), [Figma blog, 2024](https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/)).

:::interview
When asked how to shard, answer in order: why one node is not enough, with numbers; the shard key, from the main queries and atomic writes; how keys map to shards and how nodes are added; and what happens to big tenants, hot keys, and queries without the key.
:::

## Cheat sheet

- Shard only when an estimate shows that the writes or the data will outgrow the largest node you are willing to run. First try a bigger machine, reads from followers and a cache, archiving old data, and moving whole features to their own databases.
- Sharding splits the rows of a table across nodes. Each row lives in one shard, and each shard has its own leader and followers. It adds capacity for writes and data at the price of routing, queries without the key, writes across shards, and moving data. Start while the leader still has spare capacity.
- The shard key decides which requests stay on one shard. Pick the column shared by the frequent queries and the writes that must be atomic, usually the tenant ID. It needs many values with similar load, and its value must not change for a row. Every tenant table carries the key in its primary key; small shared tables are copied to every shard.
- Key ranges keep keys sorted, so range reads touch one shard or a few, and ranges split as they grow. Keys written in order, such as timestamps or auto-increment IDs, all go to the last range: put another field first.
- Hashing spreads keys evenly but loses their order, so a range read over the hashed key asks every shard. Use a hash that is stable across processes, and in a composite key hash only the shard key columns.
- Hash mod the number of nodes moves about N/(N + 1) of the keys when a node is added. Hash into a fixed number of logical shards, many more than nodes and with many divisors, and map shards to nodes; a new node then takes whole shards. Or let the database split shards as they grow.
- Consistent hashing moves about 1/N of the keys when a node changes and needs no central map; virtual nodes even out the load. It fits caches and leaderless stores; databases with a coordinator usually use logical shards and a map.
- Use the routing the database provides; when sharding in the app, start with a client library and move to a routing tier when several services or languages use the data or queries need merging across shards. Compute the shard from the key and keep a shard directory only for tenants placed by hand. Keep the map in a store built on consensus, cache it in the routers, and check its version on every request.
- Rebalancing moves whole shards: copy a snapshot, stream the changes and check that the copies match, pause writes briefly, switch the map, and keep streaming changes back to the old copy as a way back. Choose moves from measured load, plan big moves before peaks, and have a person approve moves under heavy load, since automatic moves can spread an overload.
- Skew is an uneven split of data or load, and a tenant key makes it likely. Track load per tenant, give a big tenant its own shard, split it by a finer key only when it outgrows a node, and limit tenants by plan.
- In the pool model tenants share tables; in the bridge model each has its own database schema or set of tables; in the silo model each has its own database. A silo separates load, failures, backups, and location at the cost of many databases. Start with the pool, use silos for a clear requirement, and place both through the shard directory.
- A hot key needs more than a whole shard can give, so more shards and moves do not help. Serve hot reads from a cache or extra followers, and salt a key only when its writes exceed one shard; reads then merge all suffixes.
- Scatter-gather asks every shard: such queries gain no throughput from more shards, the slowest shard sets their latency, and top N, medians, and pages are hard to merge. Joins across differently keyed tables need co-location, copies, or a join in the app. Keep such queries rare and off the paths users wait on; when one must stay there, hedge slow requests. Run reports on an analytics copy.
- A local index costs one shard per write and every shard per read without the shard key. A global index costs one index shard per read and a second shard per write, so it slows writes or lags. Use a global index for frequent lookups without the key; for uniqueness across shards, write its entry first or in the same transaction.
- A transaction covers one shard. Keep writes that must be atomic on one shard through the key; for the rare write across shards use steps that are safe to repeat for moves, a saga when earlier steps may need undoing, and a distributed transaction only where the database provides it.
- Default scheme for a multi-tenant app: shard by tenant ID, hash into a fixed number of logical shards, keep the map in a store built on consensus, add a directory for the largest tenants and the silos, and sort rows inside a tenant by a second column. Let a database that shards on its own do the sharding when you can, with the tenant ID as its key; shard in the app only for full control over the split or to stay on your current database service.
