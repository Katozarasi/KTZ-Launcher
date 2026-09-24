// Only loaded by test-redesign-ui.cjs, never by the shipped launcher.
/* global window */
const path = require('path')
const root = process.env.KTZ_UI_APP_ROOT || path.resolve(__dirname, '..')
// Inject fixtures at the service boundary; never contact account APIs in UI tests.
const skinModule = require(path.join(root, 'app/assets/js/skinmanager'))
const { createFixture } = require('./skin-test-fixtures.cjs')
const fixture = createFixture()
const originalFactory = skinModule.createSkinManager
skinModule.createSkinManager = options => originalFactory({ ...options, validateAccount: async () => true, transport: fixture.transport })
window.ktzSkinTest = fixture
const { DistroAPI } = require(path.join(root, 'app/assets/js/distromanager'))
DistroAPI.toggleDevMode(true)
require(path.join(root, 'app/assets/js/preloader'))
