const { fork, execFile } = require('child_process')
const path = require('path')

// Keep unbounded registry/drive/JVM probes outside the renderer. Only this
// worker and its probe children are terminated when discovery times out.
function runJvmWorker(request, { timeoutMs = 30000, workerPath = path.join(__dirname, 'javadiscoveryworker.js') } = {}) {
    return new Promise((resolve, reject) => {
        const worker = fork(workerPath, [], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            windowsHide: true
        })
        let settled = false
        const finish = (error, details) => {
            if(settled) return
            settled = true
            clearTimeout(timer)
            if(error) reject(error)
            else resolve(details)
        }
        const timer = setTimeout(() => {
            const error = new Error('Java discovery timed out')
            error.code = 'JAVA_SCAN_TIMEOUT'
            if(process.platform === 'win32' && worker.pid) {
                execFile('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], {
                    windowsHide: true,
                    timeout: 5000
                }, () => worker.kill())
            } else {
                worker.kill()
            }
            finish(error)
        }, timeoutMs)
        worker.on('message', message => {
            if(message.error) {
                const error = new Error(message.error)
                error.code = 'JAVA_SCAN_FAILED'
                finish(error)
            } else {
                finish(null, message.details)
            }
        })
        worker.once('error', error => finish(error))
        worker.once('exit', () => finish(new Error('Java discovery worker exited without a result')))
        worker.send(request, error => { if(error) finish(error) })
    })
}

exports.discoverPreferredJvm = (dataDir, supported) => runJvmWorker({ action: 'discover', dataDir, supported })
exports.validateJvm = (root, supported) => runJvmWorker({ action: 'validate', root, supported })
exports.runJvmWorker = runJvmWorker
