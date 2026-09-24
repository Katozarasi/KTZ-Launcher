const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')

const elements = new Map()
function element(id){
    if(!elements.has(id)) elements.set(id, {
        textContent: 'PLAY', disabled: false, attributes: {}, style: { display: 'none' }, handlers: [],
        hasAttribute(name){ return name in this.attributes },
        setAttribute(name, value){ this.attributes[name] = value },
        removeAttribute(name){ delete this.attributes[name] },
        addEventListener(type, handler){ if(type === 'click') this.handlers.push(handler) }
    })
    return elements.get(id)
}
const events = []
let child
let failBuild = false
let builds = 0
class Builder {
    build(){
        builds++
        if(failBuild) throw new Error('test build failure')
        child = new EventEmitter()
        child.exitCode = null
        child.killed = false
        return child
    }
}
const window = { getComputedStyle: el => el.style }
const context = {
    window, console, ConfigManager: { getSelectedServer: () => 'astervale', getLauncherDirectory: () => 'unused' },
    document: { getElementById: element, dispatchEvent: event => events.push(event.detail.state) },
    CustomEvent: class { constructor(type, options){ this.type = type; this.detail = options.detail } },
    require: id => {
        if(id.includes('processbuilder')) return Builder
        if(id === 'path') return path
        if(id === 'fs-extra') return { existsSync: () => false }
        throw new Error(`Unexpected import ${id}`)
    },
    setTimeout: () => 1, clearTimeout: () => {},
    setLaunchDetails: () => {}, setLaunchPercentage: () => {},
    toggleLaunchArea: show => {
        element('launch_details').style.display = show ? 'flex' : 'none'
        element('launch_content').style.display = show ? 'none' : 'flex'
    },
    remote: { getCurrentWindow: () => ({ setProgressBar: () => {} }) }
}
vm.createContext(context)
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/assets/js/scripts/ktzLaunchGuard.js'), 'utf8'), context)
context.ktzInstallLaunchGuard()
function click(){
    const event = { prevented: false, stopped: false, preventDefault(){ this.prevented = true }, stopImmediatePropagation(){ this.stopped = true } }
    element('launch_button').handlers.forEach(fn => fn(event))
    return event
}
assert.equal(click().stopped, false)
assert.equal(window.ktzLaunchState, 'starting')
assert.equal(click().stopped, true)
assert.equal(element('server_selection_button').disabled, true)
const builder = new Builder()
builder.build()
assert.equal(window.ktzLaunchState, 'running')
assert.throws(() => builder.build(), /already running/)
assert.equal(builds, 1)
child.emit('close', 1)
assert.equal(window.ktzLaunchState, 'idle')
assert.equal(element('launch_button').disabled, false)
assert.equal(element('launch_details').style.display, 'none')
assert.equal(element('server_selection_button').disabled, false)
click()
failBuild = true
assert.throws(() => builder.build(), /test build failure/)
assert.equal(window.ktzLaunchState, 'idle')
failBuild = false
click()
builder.build()
child.emit('error', new Error('test process error'))
assert.equal(window.ktzLaunchState, 'idle')
assert.equal(element('launch_button').textContent, 'PLAY')
assert.deepEqual(events, ['starting', 'running', 'idle', 'starting', 'idle', 'starting', 'running', 'idle'])
console.log('Launch guard tests passed: double click, duplicate build, early exit, build failure, process error, state events.')
