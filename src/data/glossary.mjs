// The site glossary. One entry per term.
//
// - `term`: the name shown in the glossary. Keep the official spelling of names and
//   abbreviations (OpenAPI, GraphQL, gRPC, TCP). Start common words with a capital letter
//   (Failover, Exponential backoff).
// - `aliases`: exact spellings to find in articles (case-sensitive). Defaults to [term] plus
//   the same with a lowercase first letter, so "Failover" also finds "failover".
// - `expansion`: what an abbreviation stands for. Only for abbreviations.
// - `short`: one sentence that fits any context. Shown in the tooltip.
// - `explanation`: two or three sentences: what it is and why it matters in a design.
// - `readMore`: where to read more. `href` is a site path (no leading slash, may have `#anchor`)
//   or a full external URL. A page that is the `readMore` of a term explains it in its own text,
//   so the term gets no tooltip on that page.
//
// Write in simple English. Keep `short` and `explanation` true in any context.

const networking = (anchor, section) => ({
	href: `fundamentals/networking/#${anchor}`,
	label: `Networking: ${section}`,
});

const storageEngines = (anchor, section) => ({
	href: `fundamentals/storage-engines/#${anchor}`,
	label: `Storage engines: ${section}`,
});

/** @type {Array<{id: string, term: string, aliases?: string[], expansion?: string, short: string, explanation: string, readMore?: {href: string, label: string}}>} */
export const glossary = [
	{
		id: 'client-server',
		term: 'Client-server',
		aliases: ['client-server', 'Client-server'],
		short: 'A model of interaction in which a client requests work or data from a server.',
		explanation:
			'The server handles the request and returns a response. Client and server are roles: the same component can serve one caller and make requests to another component.',
		readMore: networking('the-app-talks-to-the-server', 'The app talks to the server'),
	},
	{
		id: 'api',
		term: 'API',
		expansion: 'Application Programming Interface',
		short: 'A contract that lets one program use another program.',
		explanation:
			'An API says which requests a program accepts and what it returns. In system design, it usually means the network endpoints that clients and other services call.',
		readMore: { href: 'https://en.wikipedia.org/wiki/API', label: 'Wikipedia: API' },
	},
	{
		id: 'http',
		term: 'HTTP',
		expansion: 'Hypertext Transfer Protocol',
		short: 'The request-response protocol of the web.',
		explanation:
			'A client sends a request with a method (GET, POST, …), a path, and headers. The server sends back a status code, headers, and a body. Most public APIs run on HTTP.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'https',
		term: 'HTTPS',
		expansion: 'HTTP Secure',
		short: 'HTTP sent over an encrypted TLS connection.',
		explanation:
			'HTTPS is the same HTTP, but TLS encrypts it and proves the server is who it claims to be. Today almost all web traffic uses HTTPS.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'http-2',
		term: 'HTTP/2',
		short: 'A newer version of HTTP that sends many requests over one connection at the same time.',
		explanation:
			'HTTP/2 splits requests into streams on one TCP connection and compresses headers. A lost TCP packet still stops all streams until it is resent.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'http-3',
		term: 'HTTP/3',
		short: 'The version of HTTP that runs on QUIC instead of TCP.',
		explanation:
			'HTTP/3 keeps the many-streams model of HTTP/2, but a lost packet holds up only the streams whose data it carried. It also sets up connections faster.',
		readMore: networking('agreeing-on-the-format', 'Agreeing on the format'),
	},
	{
		id: 'dns',
		term: 'DNS',
		expansion: 'Domain Name System',
		short: 'The system that turns a domain name into an IP address.',
		explanation:
			'Before a client can connect to example.com, it asks DNS for the address. Answers are cached for the time set by their TTL. DNS can also spread users across servers or regions by returning different addresses.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'ttl',
		term: 'TTL',
		expansion: 'Time To Live',
		short: 'How long a piece of data stays valid before it must be refreshed or dropped.',
		explanation:
			'Caches and DNS answers use a TTL to limit how long stored data can be reused. A short TTL means fresher data but more refreshes. A long TTL means fewer refreshes, but changes spread more slowly.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Time_to_live', label: 'Wikipedia: Time to live' },
	},
	{
		id: 'osi',
		term: 'OSI model',
		aliases: ['OSI model', 'OSI'],
		expansion: 'Open Systems Interconnection model',
		short: 'A model that divides network communication into seven layers.',
		explanation:
			'Each layer describes a different part of communication. The layer numbers help distinguish addressing (L3), transport (L4), and application messages (L7) when discussing protocols and load balancers.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'ip-address',
		term: 'IP address',
		aliases: ['IP address', 'IP addresses', 'IP'],
		expansion: 'Internet Protocol address',
		short: 'The number that identifies a device on a network.',
		explanation:
			'IP, the Internet Protocol, delivers packets to these addresses with no guarantees; TCP and UDP run on top of it. DNS maps names to IP addresses.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'port',
		term: 'Port',
		aliases: ['port', 'ports', 'Port'],
		short: 'A number that identifies a program on a machine, so one IP address can serve many programs.',
		explanation:
			'A connection goes to an IP address and a port, for example port 443 for HTTPS. L4 load balancers route traffic by IP address and port.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'tcp',
		term: 'TCP',
		expansion: 'Transmission Control Protocol',
		short: 'A transport protocol that delivers a reliable, ordered stream of bytes over a connection.',
		explanation:
			'TCP opens a connection with a handshake, numbers every byte, and resends what gets lost. This makes it reliable, but a lost packet delays all data after it. HTTP/1.1, HTTP/2, and most databases run on TCP.',
		readMore: networking('delivering-data', 'Delivering data'),
	},
	{
		id: 'udp',
		term: 'UDP',
		expansion: 'User Datagram Protocol',
		short: 'A transport protocol that sends separate messages with no delivery or order guarantees.',
		explanation:
			'UDP has no connection and no resends, so it adds very little delay. The application must handle loss and order itself if it cares. Live audio, video, games, and QUIC use UDP.',
		readMore: networking('delivering-data', 'Delivering data'),
	},
	{
		id: 'quic',
		term: 'QUIC',
		short: 'A transport protocol on top of UDP that gives reliable streams with built-in encryption.',
		explanation:
			'QUIC does what TCP and TLS do together, but each stream recovers from loss on its own. HTTP/3 runs on QUIC.',
		readMore: { href: 'https://en.wikipedia.org/wiki/QUIC', label: 'Wikipedia: QUIC' },
	},
	{
		id: 'tls',
		term: 'TLS',
		expansion: 'Transport Layer Security',
		short: 'The protocol that encrypts a connection and proves the server is who it claims to be.',
		explanation:
			'During the TLS handshake, the client checks the server certificate and both sides agree on keys. After that, all data is encrypted. HTTPS is HTTP over TLS.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'mtls',
		term: 'mTLS',
		expansion: 'Mutual TLS',
		short: 'TLS in which both sides show a certificate.',
		explanation:
			'Each side proves who it is to the other, so only known services can connect. It is common for traffic between internal services.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'round-trip',
		term: 'Round trip',
		aliases: ['round trip', 'round trips', 'Round trip'],
		short: 'The time for a message to reach the other side and for the answer to come back.',
		explanation:
			'Also called RTT (round-trip time). Every handshake costs at least one round trip, so distance between client and server adds up fast.',
		readMore: { href: 'https://developer.mozilla.org/en-US/docs/Glossary/Round_Trip_Time', label: 'MDN: Round trip time' },
	},
	{
		id: 'keep-alive',
		term: 'Keep-alive',
		short: 'Keeping a connection open after a response, so the next request can reuse it.',
		explanation:
			'Reusing a connection skips the TCP and TLS handshakes. Clients and servers close idle connections after a timeout.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'connection-pool',
		term: 'Connection pool',
		aliases: ['connection pool', 'connection pools'],
		short: 'A set of open connections that a client keeps and reuses.',
		explanation:
			'Opening a connection is slow, so services keep a pool of them to databases and other services. The pool size also limits how much load one client can put on a server.',
		readMore: networking('securing-the-connection', 'Securing the connection'),
	},
	{
		id: 'rest',
		term: 'REST',
		expansion: 'Representational State Transfer',
		short: 'An API style built on resources (URLs) and standard HTTP methods.',
		explanation:
			'Each thing is a resource with a URL, such as /orders/42. Clients read and change it with GET, POST, PUT, and DELETE. REST is the default style for public APIs.',
		readMore: { href: 'https://developer.mozilla.org/en-US/docs/Glossary/REST', label: 'MDN: REST' },
	},
	{
		id: 'grpc',
		term: 'gRPC',
		short: 'A framework for calling functions on another service, with binary messages over HTTP/2.',
		explanation:
			'You describe the calls in a .proto file and generate client and server code from it. Messages are small and fast to parse. It is common for service-to-service calls, but browsers cannot call it directly.',
		readMore: { href: 'https://grpc.io/docs/what-is-grpc/introduction/', label: 'grpc.io: Introduction to gRPC' },
	},
	{
		id: 'graphql',
		term: 'GraphQL',
		short: 'An API style where the client sends a query that names exactly the fields it needs.',
		explanation:
			'There is usually one endpoint, and the response has the shape of the query. It avoids over-fetching and many round trips, but caching and rate limiting are harder.',
		readMore: { href: 'https://graphql.org/learn/', label: 'graphql.org: Learn GraphQL' },
	},
	{
		id: 'rate-limit',
		term: 'Rate limit',
		aliases: ['rate limit', 'rate limits', 'Rate limits'],
		short: 'A cap on how many requests a client may send in a period of time.',
		explanation: 'Rate limits protect a service from overload and abuse. Requests over the limit usually get HTTP 429.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'idempotency-key',
		term: 'Idempotency key',
		aliases: ['idempotency key', 'idempotency keys', 'Idempotency keys'],
		short: 'A unique ID the client attaches to a request, so the server can recognize a retry of it.',
		explanation:
			'If the same key comes again, the server returns the saved result instead of doing the work twice. Used for payments and orders.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'polling',
		term: 'Polling',
		short: 'The client asks the server for new data again and again on a timer.',
		explanation: 'Polling is simple and works everywhere. The cost is delay (up to one interval) and many empty requests.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'long-polling',
		term: 'Long polling',
		aliases: ['long polling', 'Long polling'],
		short: 'The server holds a request open until it has new data or a timeout, then the client asks again.',
		explanation: 'Long polling gives near real-time updates over plain HTTP, without new infrastructure.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'sse',
		term: 'SSE',
		expansion: 'Server-Sent Events',
		short: 'A long HTTP response through which the server streams text events to the client.',
		explanation:
			'Browsers reconnect by themselves and send the ID of the last event, if the server sets IDs. SSE sends data only from server to client.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'websocket',
		term: 'WebSocket',
		aliases: ['WebSockets', 'WebSocket'],
		short: 'A long-lived connection where client and server can both send messages at any time.',
		explanation:
			'It starts as an HTTP request and then upgrades to a two-way channel on the same TCP connection. Used for chat, collaboration, and games.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'webrtc',
		term: 'WebRTC',
		expansion: 'Web Real-Time Communication',
		short: 'A technology for direct peer-to-peer audio, video, and data in browsers and mobile apps.',
		explanation:
			'Peers connect to each other over UDP when they can. A signaling server, STUN, and TURN help them find each other through NAT.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'turn',
		term: 'TURN',
		expansion: 'Traversal Using Relays around NAT',
		short: 'A relay server that forwards traffic between peers when they cannot connect directly.',
		explanation: 'TURN relays media when a direct connection is not possible. All media then goes through the relay, so it needs enough bandwidth.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'signaling',
		term: 'Signaling',
		short: 'Exchanging connection details between two peers before they connect directly.',
		explanation:
			'WebRTC does not define how signaling works. Apps usually send it through a server they already have, for example over WebSocket.',
		readMore: networking('pushing-new-messages', 'Pushing new messages'),
	},
	{
		id: 'load-balancer',
		term: 'Load balancer',
		aliases: ['load balancer', 'load balancers'],
		short: 'A component that spreads incoming traffic across several servers.',
		explanation: 'It also stops sending traffic to servers that fail health checks, so clients see one stable address.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'l4-l7',
		term: 'L4 / L7',
		aliases: ['L4', 'L7'],
		short: 'Network layers: L4 is the transport layer (TCP, UDP), L7 is the application layer (HTTP).',
		explanation: 'An L4 load balancer routes connections. An L7 load balancer reads each HTTP request and can route by path or header.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'round-robin',
		term: 'Round robin',
		aliases: ['round robin', 'Round robin'],
		short: 'Sending each new request to the next server in turn.',
		explanation: 'Round robin is simple and works well when requests cost about the same.',
		readMore: networking('spreading-the-load', 'Spreading the load'),
	},
	{
		id: 'weighted-round-robin',
		term: 'Weighted round robin',
		aliases: ['weighted round robin', 'Weighted round robin'],
		short: 'Round robin that sends more requests to servers with a higher weight.',
		explanation: 'Weights follow server capacity, so a server twice as big gets twice the traffic.',
		readMore: networking('spreading-the-load', 'Spreading the load'),
	},
	{
		id: 'least-connections',
		term: 'Least connections',
		aliases: ['least connections', 'Least connections'],
		short: 'Sending each new connection to the server with the fewest open connections.',
		explanation: 'Good for long-lived connections, where the number of open connections shows the load better than the number of requests.',
		readMore: networking('spreading-the-load', 'Spreading the load'),
	},
	{
		id: 'health-check',
		term: 'Health check',
		aliases: ['health check', 'health checks', 'Health checks'],
		short: 'A regular probe that tells whether a server can take traffic.',
		explanation: 'Load balancers remove servers that fail several checks in a row and add them back after several successes.',
		readMore: networking('adding-servers', 'Adding servers'),
	},
	{
		id: 'single-point-of-failure',
		term: 'Single point of failure',
		aliases: ['single point of failure', 'Single point of failure'],
		short: 'A part whose failure stops the whole system.',
		explanation: 'Remove it by running more than one copy and switching to a healthy one automatically.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Single_point_of_failure', label: 'Wikipedia: Single point of failure' },
	},
	{
		id: 'sticky-sessions',
		term: 'Sticky sessions',
		aliases: ['sticky sessions', 'Sticky sessions'],
		short: 'Sending all requests from one client to the same server.',
		explanation: 'It keeps server-local state usable, but makes failover and rebalancing harder.',
		readMore: networking('servers-with-state', 'Servers with state'),
	},
	{
		id: 'stateless',
		term: 'Stateless',
		aliases: ['stateless', 'Stateless'],
		short: 'Keeping no user data on the server between requests.',
		explanation:
			'Each request carries what the server needs, and user data lives in a shared store. Any server can then handle any request, which makes scaling and failures simpler.',
		readMore: networking('servers-with-state', 'Servers with state'),
	},
	{
		id: 'service-discovery',
		term: 'Service discovery',
		short: 'A way for services to find the current addresses of other services.',
		explanation: 'Instances register themselves, and clients ask the registry for healthy instances. A load balancer or the client itself uses it to pick a live instance.',
		readMore: networking('finding-the-server', 'Finding the server'),
	},
	{
		id: 'cdn',
		term: 'CDN',
		expansion: 'Content Delivery Network',
		short: 'A network of servers around the world that cache content close to users.',
		explanation: 'A CDN cuts latency for users and load on your servers. It suits static files and responses that many users read.',
		readMore: networking('users-far-away', 'Users far away'),
	},
	{
		id: 'geodns',
		term: 'GeoDNS',
		short: 'DNS that answers with different addresses depending on where the client is.',
		explanation:
			'It picks a region from an estimate of where the user is. Cached answers delay a change until they expire, and open connections must reconnect.',
		readMore: networking('users-far-away', 'Users far away'),
	},
	{
		id: 'consistency',
		term: 'Consistency',
		aliases: ['consistency', 'Consistency'],
		short: 'The rules for which version of data a read may return.',
		explanation:
			'With strong consistency, a read sees the latest completed write. Weaker consistency allows older data, which needs less coordination between copies and makes reads faster.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Consistency_model', label: 'Wikipedia: Consistency model' },
	},
	{
		id: 'deadline',
		term: 'Deadline',
		aliases: ['deadline', 'deadlines'],
		short: 'The latest time by which a whole request must finish.',
		explanation: 'Each service passes the remaining time to the services it calls, so they can stop work that is no longer needed.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'exponential-backoff',
		term: 'Exponential backoff',
		short: 'Waiting longer after each failed try, for example 100 ms, 200 ms, 400 ms.',
		explanation: 'It gives a struggling service time to recover. Combine it with jitter and a cap on tries.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'jitter',
		term: 'Jitter',
		short: 'A random extra wait added before a retry.',
		explanation: 'Without jitter, many clients retry at the same moment and overload the service again.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'circuit-breaker',
		term: 'Circuit breaker',
		aliases: ['circuit breaker', 'Circuit breaker'],
		short: 'A guard that stops calls to a failing dependency for a while and fails fast instead.',
		explanation: 'It has three states: closed (calls pass), open (calls fail fast), and half-open (a few test calls). It keeps one failure from spreading.',
		readMore: networking('when-a-call-fails', 'When a call fails'),
	},
	{
		id: 'storage-engine',
		term: 'Storage engine',
		aliases: ['storage engine', 'storage engines', 'Storage engine', 'Storage engines'],
		short: 'The part of a database that stores records on disk or in memory and finds them again.',
		explanation:
			'It decides which reads and writes are cheap. Most engines are built on a B-tree or an LSM-tree, and the choice follows the workload.',
		readMore: { href: 'fundamentals/storage-engines/', label: 'Storage engines' },
	},
	{
		id: 'append-only-log',
		term: 'Append-only log',
		aliases: ['append-only log', 'append-only logs', 'Append-only log', 'append-only file', 'append-only files', 'Append-only file'],
		short: 'A file of records that only grows at the end; old records are never changed.',
		explanation:
			'Appending is the cheapest write, and a newer record for a key replaces the older one. Many databases keep a log inside, for recovery or as their main storage.',
		readMore: storageEngines('from-memory-to-disk', 'From memory to disk'),
	},
	{
		id: 'index',
		term: 'Index',
		aliases: ['index', 'indexes', 'Index', 'Indexes'],
		short: 'Extra data, built from the records, that finds a record without a full scan.',
		explanation:
			'An index speeds up reads, but it takes space and every write must update it too. So a database indexes only what its queries need.',
		readMore: storageEngines('finding-a-record-fast', 'Finding a record fast'),
	},
	{
		id: 'hash-index',
		term: 'Hash index',
		aliases: ['hash index', 'hash indexes', 'Hash index'],
		short: 'An index that maps each key to the place of its record through a hash map.',
		explanation:
			'It answers lookups by exact key in one step, but it keeps no order, so it cannot return a range of keys. An in-memory hash index needs all keys to fit in RAM.',
		readMore: storageEngines('finding-a-record-fast', 'Finding a record fast'),
	},
	{
		id: 'compaction',
		term: 'Compaction',
		aliases: ['compaction', 'Compaction'],
		short: 'Background work that merges data files and keeps only the latest record for each key.',
		explanation:
			'It frees the space taken by old and deleted records. It also competes with requests for the disk, and when writes outrun it, files pile up.',
		readMore: storageEngines('reclaiming-space', 'Reclaiming space'),
	},
	{
		id: 'tombstone',
		term: 'Tombstone',
		aliases: ['tombstone', 'tombstones', 'Tombstone'],
		short: 'A record that marks a key as deleted.',
		explanation:
			'Files that are only appended to cannot erase a record, so a delete writes a tombstone. It must stay until no older file can bring the deleted value back, and until compaction removes the key, the deleted data is still on disk.',
		readMore: storageEngines('reclaiming-space', 'Reclaiming space'),
	},
	{
		id: 'checksum',
		term: 'Checksum',
		aliases: ['checksum', 'checksums', 'Checksum'],
		short: 'A small value computed from data to detect whether the data has changed.',
		explanation:
			'The writer stores it next to the data, and the reader computes it again. A mismatch means the data is incomplete or damaged.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Checksum', label: 'Wikipedia: Checksum' },
	},
	{
		id: 'page-cache',
		term: 'Page cache',
		aliases: ['page cache', 'Page cache'],
		short: 'Memory where the operating system keeps recently read and written parts of files.',
		explanation:
			'Reads of hot data skip the disk. Written data waits there before it reaches the disk, so a power loss can erase it until a flush.',
		readMore: storageEngines('surviving-a-crash', 'Surviving a crash'),
	},
	{
		id: 'durability',
		term: 'Durability',
		aliases: ['durability', 'Durability', 'durable'],
		short: 'The promise that a confirmed write survives a crash or a power loss.',
		explanation:
			'A write is durable only after a flush, such as fsync, puts it on disk. The store chooses whether to confirm a write before or after that flush.',
		readMore: storageEngines('surviving-a-crash', 'Surviving a crash'),
	},
	{
		id: 'group-commit',
		term: 'Group commit',
		aliases: ['group commit', 'Group commit'],
		short: 'Making several writes durable with one shared flush.',
		explanation:
			'The store collects the writes that arrive within a few milliseconds and flushes them together. It can then wait for the disk before saying "ok" without paying a flush for each write.',
		readMore: storageEngines('surviving-a-crash', 'Surviving a crash'),
	},
	{
		id: 'snapshot',
		term: 'Snapshot',
		aliases: ['snapshot', 'snapshots', 'Snapshot'],
		short: 'The state of data at one moment.',
		explanation:
			'An in-memory store saves snapshots for recovery: after a restart, it loads the last one and replays only the log written after it. With snapshots alone, the changes since the last one are lost.',
		readMore: storageEngines('back-to-memory', 'Back to memory'),
	},
	{
		id: 'sstable',
		term: 'SSTable',
		aliases: ['SSTable', 'SSTables', 'sorted string table'],
		expansion: 'Sorted String Table',
		short: 'A data file whose records are sorted by key and never change after it is written.',
		explanation:
			'The order allows a sparse index, range reads, and cheap merges. LSM-trees store their data in SSTables.',
		readMore: storageEngines('keeping-records-sorted', 'Keeping records sorted'),
	},
	{
		id: 'sparse-index',
		term: 'Sparse index',
		aliases: ['sparse index', 'sparse indexes', 'Sparse index'],
		short: 'An index that keeps one key per block of sorted records instead of one key per record.',
		explanation:
			'A read finds the right block and scans it. The index is much smaller, so it fits in memory for far more data.',
		readMore: storageEngines('keeping-records-sorted', 'Keeping records sorted'),
	},
	{
		id: 'memtable',
		term: 'Memtable',
		aliases: ['memtable', 'memtables', 'Memtable'],
		short: 'A sorted structure in memory that collects new writes before they go to disk.',
		explanation:
			'When it is full, it is written out as a new SSTable in one sequential write. A WAL protects it from a crash.',
		readMore: storageEngines('sorting-writes-in-memory', 'Sorting writes in memory'),
	},
	{
		id: 'wal',
		term: 'WAL',
		aliases: ['WAL', 'write-ahead log', 'Write-ahead log'],
		expansion: 'Write-ahead log',
		short: 'A log on disk where changes are written before the data files they change.',
		explanation:
			'After a crash, the database replays it to rebuild the memtable of an LSM-tree or to repair half-written pages of a B-tree. A write is confirmed once its log record is flushed.',
		readMore: storageEngines('sorting-writes-in-memory', 'Sorting writes in memory'),
	},
	{
		id: 'lsm-tree',
		term: 'LSM-tree',
		aliases: ['LSM-tree', 'LSM-trees', 'LSM tree', 'LSM trees', 'log-structured merge-tree'],
		expansion: 'Log-structured merge-tree',
		short: 'A storage engine that collects writes in memory and writes them out as sorted files merged in the background.',
		explanation:
			'The log is appended in order, and sorted files are written and merged in order, so writes tend to be fast. Reads may check several files, and compaction can fall behind under heavy writes.',
		readMore: storageEngines('sorting-writes-in-memory', 'Sorting writes in memory'),
	},
	{
		id: 'bloom-filter',
		term: 'Bloom filter',
		aliases: ['Bloom filter', 'Bloom filters', 'bloom filter', 'bloom filters'],
		short: 'A small bit array that says whether a key is definitely absent or maybe present.',
		explanation:
			'It never misses a key that is there, but it sometimes says "maybe" for a key that is not. A lookup by key uses it to skip files that cannot hold the key; range reads get no help.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'false-positive',
		term: 'False positive',
		aliases: ['false positive', 'false positives', 'False positive'],
		short: 'A check that says "yes" or "maybe" when the true answer is "no".',
		explanation:
			'A Bloom filter can give false positives but never false negatives. A false positive costs extra work, such as opening a file for nothing, but never a wrong answer.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'size-tiered-compaction',
		term: 'Size-tiered compaction',
		aliases: ['size-tiered compaction', 'Size-tiered compaction'],
		short: 'A compaction strategy that merges files of similar size.',
		explanation: 'It rewrites data fewer times than leveled compaction, so writes are cheaper. Reads check more files, and merges need more spare disk space.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'leveled-compaction',
		term: 'Leveled compaction',
		aliases: ['leveled compaction', 'Leveled compaction'],
		short: 'A compaction strategy that keeps files in levels where, apart from newly flushed files, the files of one level do not overlap in keys.',
		explanation:
			'A lookup by key checks the newly flushed files and at most one file in each other level. Data takes less space than with size-tiered compaction, but it is rewritten more often.',
		readMore: storageEngines('keeping-reads-cheap', 'Keeping reads cheap'),
	},
	{
		id: 'b-tree',
		term: 'B-tree',
		aliases: ['B-tree', 'B-trees', 'B+tree', 'B+trees'],
		short: 'A storage structure that keeps sorted keys in a tree of fixed-size pages and changes them in place.',
		explanation:
			'A lookup follows one page per level, and the upper levels stay in memory. Leaves in key order serve ranges. It is the default index of most relational databases.',
		readMore: storageEngines('updating-in-place', 'Updating in place'),
	},
	{
		id: 'amplification',
		term: 'Amplification',
		aliases: [
			'amplification',
			'Read amplification',
			'Write amplification',
			'Space amplification',
			'read amplification',
			'write amplification',
			'space amplification',
		],
		short: 'How much more the disk reads, writes, or stores than the data the app asked for.',
		explanation: 'Read, write, and space amplification measure different costs. Compare storage engines on the same workload, since the numbers depend on it.',
		readMore: storageEngines('choosing-an-engine', 'Choosing an engine'),
	},
	{
		id: 'primary-key',
		term: 'Primary key',
		aliases: ['primary key', 'primary keys', 'Primary key'],
		short: 'The column or columns that identify each record of a table.',
		explanation: 'No two records share it. The database keeps an index on it to find records by it.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Primary_key', label: 'Wikipedia: Primary key' },
	},
	{
		id: 'secondary-index',
		term: 'Secondary index',
		aliases: ['secondary index', 'secondary indexes', 'Secondary index'],
		short: 'An additional index that finds records by columns other than the primary key.',
		explanation:
			'Values need not be unique, so each entry also identifies its record: by its place in the table or by its primary key. Every write that changes the indexed columns must update it.',
		readMore: storageEngines('searching-by-other-columns', 'Searching by other columns'),
	},
	{
		id: 'composite-index',
		term: 'Composite index',
		aliases: ['composite index', 'composite indexes', 'Composite index'],
		short: 'An index on several columns, sorted by the first column, then by the next.',
		explanation:
			'Put the columns compared with = first and the sort or range column last. It usually cannot help a query that uses only a later column.',
		readMore: storageEngines('searching-by-other-columns', 'Searching by other columns'),
	},
	{
		id: 'covering-index',
		term: 'Covering index',
		aliases: ['covering index', 'covering indexes', 'Covering index'],
		short: 'An index that holds every column a query needs.',
		explanation: 'The database can answer the query from the index without reading the records. The price is a bigger index.',
		readMore: storageEngines('searching-by-other-columns', 'Searching by other columns'),
	},
	{
		id: 'query-plan',
		term: 'Query plan',
		aliases: ['query plan', 'query plans', 'Query plan'],
		short: 'The steps a database chooses to run a query, such as which index to use.',
		explanation: 'Databases show it on request (EXPLAIN in SQL). Check it to see whether a query really uses the index you added.',
		readMore: { href: 'https://en.wikipedia.org/wiki/Query_plan', label: 'Wikipedia: Query plan' },
	},
	{
		id: 'row-storage',
		term: 'Row storage',
		aliases: ['row storage', 'Row storage'],
		short: 'Keeping all values of a record together in one place.',
		explanation: 'It suits apps that read and write a few whole records at a time. A query that needs a few columns of many records still reads whole rows.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'column-storage',
		term: 'Column storage',
		aliases: ['column storage', 'Column storage', 'column store', 'column stores', 'Column store'],
		short: 'Keeping the values of each column together instead of each record together.',
		explanation:
			'A query reads only the columns it needs, and columns often compress well. New rows are collected in memory and written to the columns in batches, so work on single records is less efficient.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'oltp',
		term: 'OLTP',
		aliases: ['OLTP', 'online transaction processing'],
		expansion: 'Online transaction processing',
		short: 'The workload of an app: many small reads and writes of single records by key.',
		explanation: 'It needs fast lookups and steady latency. Row storage usually suits it.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
	{
		id: 'olap',
		term: 'OLAP',
		aliases: ['OLAP', 'online analytical processing'],
		expansion: 'Online analytical processing',
		short: 'The workload of analytics: large scans and totals over many records.',
		explanation: 'It often reads few columns of many records, which suits column storage. Analytics usually runs in a separate store loaded from the main one.',
		readMore: storageEngines('scanning-for-analytics', 'Scanning for analytics'),
	},
];
