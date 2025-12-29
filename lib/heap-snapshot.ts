import v8 from 'node:v8';
import fs from 'node:fs';
import path from 'node:path';

const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'heap-snapshots');

if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function formatBytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function writeSnapshot(): void {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = `heap-${timestamp}.heapsnapshot`;
    const filepath = path.join(SNAPSHOT_DIR, filename);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Taking heap snapshot...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const memBefore = process.memoryUsage();
    const startTime = Date.now();

    try {
        const snapshotPath = v8.writeHeapSnapshot(filepath);
        const duration = Date.now() - startTime;
        const stats = fs.statSync(snapshotPath);

        console.log(`✅ Snapshot written: ${snapshotPath}`);
        console.log(`   Size: ${formatBytes(stats.size)}`);
        console.log(`   Time: ${duration}ms`);
        console.log('\nMemory at snapshot time:');
        console.log(`   RSS:        ${formatBytes(memBefore.rss)}`);
        console.log(`   Heap Used:  ${formatBytes(memBefore.heapUsed)}`);
        console.log(`   Heap Total: ${formatBytes(memBefore.heapTotal)}`);
        console.log(`   External:   ${formatBytes(memBefore.external)}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const metadataPath = path.join(SNAPSHOT_DIR, `${timestamp}.meta.json`);
        fs.writeFileSync(metadataPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: memBefore,
            snapshotFile: filename,
            snapshotSize: stats.size,
            pid: process.pid,
            nodeVersion: process.version,
        }, null, 2));

        cleanupOldSnapshots();

    } catch (error) {
        console.error('❌ Failed to write heap snapshot:', error);
    }
}

function cleanupOldSnapshots(): void {
    try {
        const files = fs.readdirSync(SNAPSHOT_DIR)
            .filter(f => f.endsWith('.heapsnapshot'))
            .map(f => ({
                name: f,
                path: path.join(SNAPSHOT_DIR, f),
                time: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs
            }))
            .sort((a, b) => b.time - a.time);

        const toDelete = files.slice(10);

        if (toDelete.length > 0) {
            console.log(`Cleaning up ${toDelete.length} old snapshots...`);
            toDelete.forEach(file => {
                fs.unlinkSync(file.path);
                const metaPath = file.path.replace('.heapsnapshot', '.meta.json');
                if (fs.existsSync(metaPath)) {
                    fs.unlinkSync(metaPath);
                }
            });
        }
    } catch (error) {
        console.error('Warning: Failed to cleanup old snapshots:', error);
    }
}

function printMemoryStats(): void {
    const mem = process.memoryUsage();
    console.log('\nCurrent Memory Usage:');
    console.log(`   RSS:        ${formatBytes(mem.rss)}`);
    console.log(`   Heap Used:  ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`);
    console.log(`   External:   ${formatBytes(mem.external)}`);
    console.log(`   Uptime:     ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`);
    console.log();
}

if (process.env.ENABLE_HEAP_SNAPSHOT === 'true') {
    console.log('Heap snapshot enabled. Send SIGUSR2 to take snapshot.');
    console.log(`   Snapshots will be saved to: ${SNAPSHOT_DIR}`);
    console.log(`   Example: kill -SIGUSR2 ${process.pid}\n`);

    process.on('SIGUSR2', () => {
        writeSnapshot();
    });

    process.on('SIGUSR1', () => {
        printMemoryStats();
    });
}

export { writeSnapshot, printMemoryStats };