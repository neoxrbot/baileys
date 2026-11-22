import { Boom } from '@hapi/boom'
import type { AuthenticationCreds, Contact, SignalKeyStore } from '../../Types'
import { addTransactionCapability, assertMeId, initAuthCreds } from '../../Utils/auth-utils'
import logger from '../../Utils/logger'

const credsWithMe = (me?: Partial<Contact>): AuthenticationCreds => ({
	...initAuthCreds(),
	me: me ? ({ id: '123@s.whatsapp.net', ...me } as Contact) : undefined
})

describe('assertMeId', () => {
	it('returns the id when authenticated', () => {
		expect(assertMeId(credsWithMe({}))).toBe('123@s.whatsapp.net')
	})

	it('throws a 401 Boom when not authenticated', () => {
		try {
			assertMeId(credsWithMe(undefined))
			throw new Error('expected assertMeId to throw')
		} catch (err) {
			expect(err).toBeInstanceOf(Boom)
			expect((err as Boom).output.statusCode).toBe(401)
		}
	})

	it('throws when me is present but id is missing', () => {
		const creds = credsWithMe()
		creds.me = { id: '' } as Contact
		expect(() => assertMeId(creds)).toThrow(/not authenticated/)
	})
})

const createMemoryStore = () =>
	({
		get: async () => ({}),
		set: async () => {}
	}) as unknown as SignalKeyStore

describe('addTransactionCapability disposeTransactionStorage', () => {
	it('exposes a dispose method that leaves the store usable', async () => {
		const keys = addTransactionCapability(createMemoryStore(), logger, {
			maxCommitRetries: 3,
			delayBetweenTriesMs: 10
		})
		expect(typeof keys.disposeTransactionStorage).toBe('function')
		await keys.transaction(async () => {}, 'dispose-test')
		expect(() => keys.disposeTransactionStorage?.()).not.toThrow()
		// Disposing only releases the storage; a later transaction re-enables it
		await expect(keys.transaction(async () => 'ok', 'dispose-test-2')).resolves.toBe('ok')
	})
})
