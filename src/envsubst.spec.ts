import { afterEach, describe, expect, it } from '@jest/globals'
import { envsubst } from './envsubst'

describe('envsubst', () => {
  describe('substitution', () => {
    it('substitutes a single ${VAR} from the provided env', () => {
      const result = envsubst('token=${FOO}', { env: { FOO: 'bar' } })
      expect(result).toBe('token=bar')
    })

    it('substitutes multiple and adjacent references', () => {
      const result = envsubst('${A}-${B}-${A}${B}', { env: { A: 'x', B: 'y' } })
      expect(result).toBe('x-y-xy')
    })

    it('returns text unchanged when no ${...} patterns appear', () => {
      const input = 'registry=https://npm.pkg.github.com/\nalways-auth=true\n'
      expect(envsubst(input, { env: {} })).toBe(input)
    })

    it('leaves non-matching tokens alone', () => {
      const input = '$FOO ${1FOO} ${A-B} ${}'
      expect(envsubst(input, { env: { FOO: 'x', '1FOO': 'y', 'A-B': 'z' } })).toBe(input)
    })

    it('accepts var names with underscores, leading underscore, and digits after the first char', () => {
      const env = { _X1: 'a', MY_VAR_2: 'b', __: 'c' }
      expect(envsubst('${_X1} ${MY_VAR_2} ${__}', { env })).toBe('a b c')
    })
  })

  describe('onMissing', () => {
    it("defaults to 'empty' — replaces a missing var with ''", () => {
      expect(envsubst('[${MISSING}]', { env: {} })).toBe('[]')
    })

    it("'keep' preserves the original ${NAME} literal", () => {
      expect(envsubst('[${MISSING}]', { env: {}, onMissing: 'keep' })).toBe('[${MISSING}]')
    })

    it("'error' throws an Error whose message includes the missing var name", () => {
      expect(() => envsubst('[${MISSING_KEY}]', { env: {}, onMissing: 'error' })).toThrow(
        /MISSING_KEY/,
      )
    })

    it("treats an empty-string env value as present, not missing — even with 'error'", () => {
      expect(envsubst('[${FOO}]', { env: { FOO: '' }, onMissing: 'error' })).toBe('[]')
    })
  })

  describe('env source', () => {
    const KEY = '__ENVSUBST_SPEC_KEY__'

    afterEach(() => {
      delete process.env[KEY]
    })

    it('falls back to process.env when no env is provided', () => {
      process.env[KEY] = 'from-process-env'
      expect(envsubst(`v=\${${KEY}}`)).toBe('v=from-process-env')
    })
  })
})
