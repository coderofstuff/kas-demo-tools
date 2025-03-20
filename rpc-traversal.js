globalThis.WebSocket = require('websocket').w3cwebsocket; // W3C WebSocket module shim

const kaspa = require('./kaspa/kaspa');
const { RpcClient, Encoding, Resolver } = kaspa;

let rpc = new RpcClient({
    // resolver: new Resolver(),
    url: '127.0.0.1:17210',
    encoding: Encoding.Borsh,
});

rpc.addEventListener(function (event) {
    console.info(event);
});

kaspa.initConsolePanicHook();

async function run() {
    await rpc.connect();

    console.info(await rpc.getServerInfo());

    try {
        const info = await rpc.getBlockDagInfo();

        console.info(info);

        let startingHash = info.pruningPointHash;

        let blockCount = 0;

        let queue = [];
        let nextQueue = [startingHash];

        let seen = new Set();
        let cache = [];
        let missing = new Set();
        let parentChild = {};
        const startTime = new Date();

        let depth = 0;

        while (nextQueue.length > 0) {
            console.info('Depth:', depth, '|', nextQueue, '| Seen:', seen.size);
            queue = nextQueue;
            nextQueue = [];
            let maxDaaScore = 0;

            while (queue.length > 0) {
                const currHash = queue.pop();

                if (seen.has(currHash)) {
                    continue;
                } else {
                    seen.add(currHash);
                }

                blockCount++;
                depth++;

                try {
                    const block = await rpc.getBlock({ hash: currHash, includeTransactions: false });

                    maxDaaScore = Math.max(maxDaaScore, Number(block.block.header.daaScore));
                    cache.push({
                        hash: currHash,
                        daaScore: Number(block.block.header.daaScore),
                    })

                    block.block.header.parentsByLevel[0].forEach((parent) => {
                        nextQueue.push(parent);
                        parentChild[parent] = currHash;
                    });
                } catch (e) {
                    console.error(e);
                    missing.add(currHash);
                }
            }

            while (cache.length > 0 && cache[0].daaScore >= maxDaaScore + 36000) {
                let block = cache.shift();
                seen.delete(block.hash);
                delete parentChild[block.hash];
            }
        }

        console.info('Blocks Seen:', blockCount);
        console.info('Missing Hashes:', missing);

        for (const hash of missing) {
            console.info('Missing:', hash, '-> added by', parentChild[hash]);
        }
        console.info('Runtime:', (new Date() - startTime) / 1000, 'seconds');
    } finally {
        await rpc.disconnect();
    }
}

run();