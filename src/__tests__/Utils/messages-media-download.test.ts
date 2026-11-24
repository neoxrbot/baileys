import { createCipheriv, randomBytes } from 'crypto'
import * as http from 'http'
import type { AddressInfo } from 'net'
import { downloadEncryptedContent, toBuffer } from '../../Utils/messages-media'

describe('downloadEncryptedContent', () => {
	const cipherKey = randomBytes(32)
	const iv = randomBytes(16)
	let server: http.Server | undefined

	const encrypt = (plaintext: Buffer) => {
		const cipher = createCipheriv('aes-256-cbc', cipherKey, iv)
		return Buffer.concat([cipher.update(plaintext), cipher.final()])
	}

	const serve = async (handler: http.RequestListener) => {
		server = http.createServer(handler)
		await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
		const { port } = server.address() as AddressInfo
		return `http://127.0.0.1:${port}/media`
	}

	afterEach(async () => {
		server?.closeAllConnections()
		await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
		server = undefined
	})

	it('decrypts a complete download', async () => {
		const plaintext = randomBytes(64 * 1024)
		const encrypted = encrypt(plaintext)
		const url = await serve((_req, res) => {
			res.writeHead(200, { 'Content-Length': encrypted.length })
			res.end(encrypted)
		})

		const stream = await downloadEncryptedContent(url, { cipherKey, iv })

		await expect(toBuffer(stream)).resolves.toEqual(plaintext)
	})

	it('errors the returned stream when the connection drops mid-download', async () => {
		const encrypted = encrypt(randomBytes(256 * 1024))
		const url = await serve((req, res) => {
			res.writeHead(200, { 'Content-Length': encrypted.length })
			res.write(encrypted.subarray(0, 64 * 1024), () => req.socket.destroy())
		})

		const stream = await downloadEncryptedContent(url, { cipherKey, iv })

		await expect(toBuffer(stream)).rejects.toThrow('terminated')
	})

	it('closes the connection when the returned stream is destroyed early', async () => {
		const encrypted = encrypt(randomBytes(256 * 1024))
		let closed!: Promise<void>
		const url = await serve((req, res) => {
			closed = new Promise(resolve => req.socket.once('close', () => resolve()))
			res.writeHead(200, { 'Content-Length': encrypted.length })
			res.write(encrypted.subarray(0, 64 * 1024))
		})

		const stream = await downloadEncryptedContent(url, { cipherKey, iv })
		stream.destroy()

		await expect(closed).resolves.toBeUndefined()
	})
})
