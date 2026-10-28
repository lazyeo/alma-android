import { setLanguage } from './runtime'

// Node's `navigator.language` follows the host OS locale; pin tests to the
// English source catalog so assertions do not depend on the machine.
setLanguage('en')
