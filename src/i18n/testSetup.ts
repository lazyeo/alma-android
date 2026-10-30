import { configure } from '@testing-library/dom'
import { setLanguage } from './runtime'

// Node's `navigator.language` follows the host OS locale; pin tests to the
// English source catalog so assertions do not depend on the machine.
setLanguage('en')

// findBy*/waitFor default to 1s, which times out when the whole suite runs on
// a busy machine; passing tests still resolve as soon as the DOM is ready.
configure({ asyncUtilTimeout: 5000 })
