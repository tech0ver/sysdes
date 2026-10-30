// Board diagrams of the framework page: what each step leaves on the board,
// for the running example, the notification service.
// Render: bun .agents/skills/board-diagrams/scripts/build.mjs

// Board text: a heading and lines, as written on the board. The alt text is the text itself.
function board(title, heading, lines) {
	return {
		title,
		desc: [heading, ...lines].filter(Boolean).join(' / ').replace(/\s+/g, ' '),
		blocks: [{ x: 0, y: 0, title: heading, lines }],
	};
}

// The high-level design. Zones left to right: outside (clients, external
// systems), the API as the border, services, stores. Steps go from the top
// down. Arrows start at the one who acts: both the API and the sender point at the queue.
const nodes = [
	// 1. Send
	{ id: 'provider', kind: 'service', x: 0, y: 0, label: 'Provider', external: true, step: 1 },
	{ id: 'team', kind: 'client', x: 0, y: 4, label: 'Team', step: 1 },
	{ id: 'api', kind: 'gateway', x: 3.75, y: 1.75, size: [1, 15.5], label: 'API', step: 1 },
	{ id: 'queue', kind: 'queue', x: 6, y: 4.5, size: [4, 1], label: 'Queue', tech: 'Kafka', step: 1 },
	{ id: 'sender', kind: 'service', x: 11, y: 4, label: 'Sender', multi: true, step: 1 },
	// 2. Status
	{ id: 'store', kind: 'store', x: 19, y: 3.5, label: 'Message\nstore', tech: 'Cassandra', step: 2 },
	// 3. Settings
	{ id: 'user', kind: 'client', x: 0, y: 15.25, label: 'User', step: 3 },
	{ id: 'settings', kind: 'service', x: 6, y: 15.25, label: 'Settings\nservice', step: 3 },
	{ id: 'copy', kind: 'cache', x: 19, y: 11.25, label: 'Settings\ncopy', step: 3 },
	{ id: 'settings-store', kind: 'store', x: 19, y: 14.75, label: 'Settings\nstore', step: 3 },
];

// The API bar is centered at y 9.5 units, so an arrow from the API with an offset of k leaves at y 9.5 + k.
const edges = [
	// 1. Send
	{ from: 'team', to: 'api', fromSide: 'r', toSide: 'l', offset: -0.3, label: 'send', step: 1 },
	{ from: 'api', to: 'queue', fromSide: 'r', toSide: 'l', offset: -4.5, label: 'pub', step: 1 },
	{ from: 'sender', to: 'queue', label: 'sub', async: true, step: 1 },
	{ from: 'sender', to: 'provider', fromSide: 't', toSide: 'r', offset: -1, toOffset: 0, elbow: 'v', label: 'deliver', step: 1 },
	// 2. Status
	{ from: 'sender', to: 'store', label: 'write status', labelSide: 'below', labelShift: 0.13, step: 2 },
	{ from: 'team', to: 'api', fromSide: 'r', toSide: 'l', offset: 0.3, label: 'status', labelSide: 'below', step: 2 },
	{ from: 'api', to: 'store', fromSide: 'r', toSide: 't', offset: -7.25, toOffset: 0, elbow: 'h', label: 'read status', labelShift: -3, step: 2 },
	// 3. Settings
	{ from: 'user', to: 'api', fromSide: 'r', toSide: 'l', label: 'set', step: 3 },
	{ from: 'api', to: 'settings', fromSide: 'r', toSide: 'l', offset: 6.75, step: 3 },
	{ from: 'settings', to: 'settings-store', label: 'save', step: 3 },
	{ from: 'settings-store', to: 'copy', label: 'copy', async: true, step: 3 },
	{ from: 'sender', to: 'copy', fromSide: 'b', toSide: 'l', offset: 1, toOffset: 0, elbow: 'v', label: 'read', labelSegment: 1, step: 3 },
	// 4. Failures
	{ from: 'sender', to: 'queue', fromSide: 'b', toSide: 'b', offset: -1, toOffset: 1.5, via: [[11.5, 6.6], [9.5, 6.6]], label: 'retry', labelSide: 'below', async: true, step: 4 },
];

// Data next to its store, in the form that shows its shape.
const data = [
	{ near: 'queue', side: 't', text: '{message_id, user_id,\n channel, text}\nkept 7 days', step: 1 },
	{ near: 'queue', side: 'b', dx: -0.25, text: 'accepted here', step: 1 },
	{ near: 'store', side: 'b', align: 'end', table: { name: 'messages, kept 30 days', columns: ['message_id (key)', 'user_id', 'channel', 'text', 'status: queued|sent|failed'] }, step: 2 },
	{ x: 18.5, y: 13, anchor: 'end', text: 'the same, refreshed\nevery minute; kept if\nthe store is down', step: 3 },
	{ near: 'settings-store', side: 'b', align: 'end', text: 'settings:{user_id} -> {channels}', step: 3 },
];
const failure = { x: 8, y: 8, text: 'provider down:\nthe message waits\nin the queue, retried\nwith backoff', step: 4 };

const steps = ['A team sends a message to a user', 'The team reads the message status', 'A user changes channel settings', 'The provider is down: the message waits and retries'];

const hld = {
	title: 'High-level design of the notification service, built one scenario at a time',
	desc:
		'A team sends a message through the API to a queue, where it counts as accepted; senders read the queue and deliver through an external provider. ' +
		'The sender writes the status to the message store, and the team reads it through the API. ' +
		'A user saves channel settings through a settings service to a settings store; senders read a copy refreshed every minute. ' +
		'When the provider is down, the message waits in the queue and is retried with backoff. ' +
		'Next to each store, its data: the queue keeps the message for 7 days; the messages table is keyed by message_id and has a status; settings are a key-value pair by user_id.',
	steps,
	final: 'The whole design',
	width: 21.5,
	nodes: nodes.map(({ tech, ...n }) => n),
	edges,
	notes: [...data, failure],
};

// The key part: the same board, with the two components that carry the
// hardest requirements in focus, their technologies written on them, and the notes for them below.
const keyIds = ['queue', 'store'];
const keyEdges = ['pub', 'sub', 'write status', 'read status'];
const keyPart = {
	title: 'The key part on the high-level design: the queue and the message store',
	desc:
		'The whole design with the queue (Kafka) and the message store (Cassandra) in focus. ' +
		'Key part: accept 100k messages a second and never lose an accepted message. ' +
		'Messages get 100k writes and 10k status reads a second by message_id, are kept 30 days, and are spread across nodes by message_id. ' +
		'The queue is a log on disk with 3 copies that replays after a crash, so Kafka; RabbitMQ would win if per-message delays mattered more than volume. ' +
		'The message store spreads writes by message_id, so Cassandra; PostgreSQL would win if the data fit one node.',
	focusMode: true,
	width: 21.5,
	nodes: nodes.map(({ step, tech, ...n }) => ({ ...n, focus: keyIds.includes(n.id), tech: keyIds.includes(n.id) ? tech : undefined })),
	edges: edges.map(({ step, ...e }) => ({ ...e, focus: keyEdges.includes(e.label) })),
	notes: [...data, failure].map(({ step, ...n }) => ({ ...n, focus: ['queue', 'store'].includes(n.near) })),
	blocks: [
		{
			x: 0,
			y: 19.25,
			focus: true,
			title: 'Key part: accept 100k/s, never lose an accepted message',
			lines: [
				'Messages: 100k writes/s, 10k status reads/s by message_id; kept 30 days',
				'  spread across nodes by message_id',
				'Queue: log on disk with 3 copies, replay after a crash -> Kafka',
				'  alt: RabbitMQ, if per-message delays mattered more than volume',
				'Message store: writes spread by message_id -> Cassandra',
				'  alt: PostgreSQL, if the data fit one node',
			],
		},
	],
};

// A deep dive: the part of the design the problem lives in, drawn larger, with
// the steps numbered. Step 1 shows where it breaks, step 2 the choice.
const deepDive = {
	title: 'Deep dive: duplicates after a sender crash',
	desc:
		'The sender, larger: 1. it reads a message from the queue, 2. delivers it through the provider, 3. writes the status to the message store. ' +
		'A sender that crashes between 2 and 3 leaves the message unmarked, and the next sender repeats 2. ' +
		'Options: write the status before 2 (may lose the message), after 2 (may repeat it), or send a key per message to the provider. ' +
		'Choice: deliver with key = message_id, so the provider drops a repeat; no duplicates where the provider takes keys, rare duplicates elsewhere, allowed by requirement 3.',
	steps: ['The problem: a crash between 2 and 3 repeats 2', 'The choice: a key per message at the provider'],
	final: 'The deep dive',
	nodes: [
		{ id: 'queue', kind: 'queue', x: 0, y: 0.75, size: [4, 1], label: 'Queue', step: 1 },
		{ id: 'sender', kind: 'service', x: 6.5, y: 0.25, label: 'Sender', multi: true, step: 1 },
		{ id: 'provider', kind: 'service', x: 14, y: 0.25, label: 'Provider', external: true, step: 1 },
		{ id: 'store', kind: 'store', x: 7, y: 4.75, label: 'Message\nstore', step: 1 },
	],
	edges: [
		{ from: 'sender', to: 'queue', label: '1. sub', async: true, step: 1 },
		{ from: 'sender', to: 'provider', label: '2. deliver', step: 1 },
		{ from: 'sender', to: 'store', label: '3. write status', step: 1 },
	],
	notes: [
		{ x: 7.6, y: 2.65, anchor: 'end', text: 'crash between 2 and 3:\nthe next sender\nrepeats 2', step: 1 },
		{ x: 10.1, y: 1.55, text: 'key=message_id', step: 2 },
		{ near: 'provider', side: 'b', text: 'drops a repeated key', step: 2 },
	],
	blocks: [
		{
			x: 0,
			y: 8.75,
			step: 1,
			title: 'Deep dive: duplicates after a sender crash',
			lines: [
				'Problem: the sender crashes after 2, before 3;',
				'         the next sender repeats 2',
				'Options: write status before 2 (may lose)',
				'         write status after 2 (may repeat)',
				'         key per message at the provider',
			],
		},
		{
			x: 0,
			y: 12.75,
			step: 2,
			lines: [
				'Choice: key per message: no duplicates where the provider takes keys;',
				'        rare duplicates elsewhere, allowed by requirement 3',
			],
		},
	],
};

// The design after the deep dive: the same board with what changed in focus.
const deepDiveDesign = {
	title: 'The high-level design after the deep dive: delivery with a key per message',
	desc:
		'The whole design with the sender, the provider, and the deliver arrow in focus. ' +
		'The arrow now reads: deliver, key=message_id. The rest of the design is unchanged.',
	focusMode: true,
	width: 21.5,
	nodes: nodes.map(({ step, tech, ...n }) => ({ ...n, focus: ['sender', 'provider'].includes(n.id) })),
	edges: edges.map(({ step, ...e }) => (e.label === 'deliver' ? { ...e, label: 'deliver, key=message_id', focus: true } : e)),
	notes: [...data, failure].map(({ step, ...n }) => n),
};

export default {
	'framework-opening': board('Board after the opening: the task, the plan, what already exists', '', [
		'Notification service: teams send push, SMS, email to users',
		'Plan: requirements, estimates, API, data flow?, design, key part,',
		'      deep dives, resources?, cost?, operations?',
		'Given: auth service, user database',
	]),
	'framework-functional': board('Board after the functional requirements', 'Functional:', [
		'1. A team sends a message to a user by push, SMS, or email',
		'2. A user chooses which channels to receive',
		'3. A team checks whether a message was delivered',
		'Out: templates, campaigns to many users, scheduled sending',
	]),
	'framework-non-functional': board('Board after the non-functional requirements', 'Non-functional:', [
		'Scale: 50M users in one region, 1B messages a day, peaks 10x the average',
		'1. An accepted message is never lost',
		'2. Accept: 99.99% available, 100 ms for 99% of requests',
		'3. Deliver, accept to provider, for 99%: push 5 s, SMS 30 s, email 1 min;',
		'   rare duplicates are fine',
		'4. Status may lag by a few seconds',
	]),
	'framework-estimates': board('Board after the estimates', 'Estimates (assume one node: ~10k writes/s, ~10 TB of disk):', [
		'1B a day / 10^5 s = 10k/s, peak 100k/s     -> writes spread over several nodes',
		'1 KB x 1B = 1 TB a day, 30 days = 30 TB    -> data spread over several nodes',
		'1 status check per 10 messages             -> mostly writes',
	]),
	'framework-api': board('Board after the API and entities', '', [
		'Entities: Message, Settings',
		'Auth: the caller\'s token on every call',
		'Data plane:',
		'  POST /messages',
		'    Idempotency-Key',
		'    {user_id, channel, text}',
		'    -> 202 {message_id}',
		'  GET /messages/{id} -> {status}',
		'Control plane:',
		'  PUT /me/settings {channels} -> 204',
	]),
	'framework-data-flow': board('Board after the data flow', 'Flow:', [
		'request',
		'-> accept: message',
		'-> check settings: channels',
		'-> build per channel: texts',
		'-> send: result',
		'   slow: messages wait before it',
		'   calls a provider: can fail',
		'-> record: status',
	]),
	'framework-hld': hld,
	'framework-key-part': keyPart,
	'framework-deep-dive': deepDive,
	'framework-deep-dive-design': deepDiveDesign,
	'framework-resources': board('Board after the resources', 'Resources:', [
		'API: CPU, 100k/s / 10k/s per server = 10, +50% for a lost zone -> 15',
		'Queue: disk, 1 TB a day x 3 copies x 7 days = 21 TB -> 3 nodes x 8 TB',
		'       (assume a log node takes ~100k writes/s of 1 KB, copies included)',
		'Message store: writes, 100k/s x 3 copies / 10k/s per node = 30,',
		'       +50% for a lost zone -> 45 (disk: 90 TB / 45 = 2 TB per node)',
		'Latency of accept, 99%: 20 ms network + 5 ms API + 20 ms queue write < 100 ms',
	]),
	'framework-cost': board('Board after the cost', 'Cost per month (cloud):', [
		'SMS fees: 10% of 30B messages x price per SMS -> most of the bill',
		'Servers: 15 API + 3 queue + 45 store + ~10 senders = ~75 x price per instance',
		'Total: SMS fees + servers (disks are in the instance price)',
		'Proposed cut: push first, SMS as a fallback',
	]),
	'framework-operations': board('Board after the operations', '', [
		'Failures:',
		'  provider down -> messages wait in the queue, retried',
		'  zone lost     -> two zones take the load (planned 50% extra)',
		'Targets: accept 99.99%; push 5 s, SMS 30 s, email 1 min for 99%',
		'Watch: accept errors and latency,',
		'       delivery time per channel against its target,',
		'       queue lag, errors per provider',
		'Overload: marketing waits, security codes go first; a limit per team',
		'Release: a few servers, then one zone at a time; roll back on errors',
	]),
};
