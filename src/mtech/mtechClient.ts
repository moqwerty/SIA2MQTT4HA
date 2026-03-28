import * as net from 'net'
import * as crypto from 'crypto'

export interface MTechConfig {
    panelIp: string
    panelPort: number
    userPin: string
    userIndex: number
}

export type MTechAction = 'arm_away' | 'arm_home' | 'arm_night' | 'disarm'

// ── Protocol constants ────────────────────────────────────────────────────────

const ADDR_CLIENT = 0x00
const XOR_KEY = Buffer.from([0xb5, 0x37, 0x12, 0xd6, 0xe4, 0x77, 0x86, 0x93])
const HELLO_DATA = Buffer.from([0x18, 0x00, 0x07])

// ── Protocol helpers ──────────────────────────────────────────────────────────

function xorCode(data: Buffer): Buffer {
    return Buffer.from(data.map((b, i) => b ^ XOR_KEY[i % 8]))
}

function onesComplementChecksum(data: Buffer): number {
    let sum = 0xAA
    for (const b of data) {
        sum += b
        if (sum > 0xFF) sum = (sum + 1) & 0xFF
    }
    return sum & 0xFF
}

function buildPacket(addr: number, func: number, rawData: Buffer): Buffer {
    const xorData = xorCode(rawData)
    const pktNoCs = Buffer.concat([Buffer.from([addr, func]), xorData])
    const cs = onesComplementChecksum(pktNoCs)
    return Buffer.concat([pktNoCs, Buffer.from([cs])])
}

function parsePacket(raw: Buffer): { addr: number; func: number; data: Buffer } {
    const xorData = raw.slice(2, raw.length - 1)
    return { addr: raw[0], func: raw[1], data: xorCode(xorData) }
}

function extractRSAModulus(derPublicKey: Buffer): Buffer {
    let o = 0
    if (derPublicKey[o] === 0x30) {
        o++
        if (derPublicKey[o] & 0x80) o += 1 + (derPublicKey[o] & 0x7F)
        else o++
    }
    if (derPublicKey[o] !== 0x02) throw new Error('DER parse: expected INTEGER')
    o++
    let mlen: number
    if (derPublicKey[o] & 0x80) {
        const lenBytes = derPublicKey[o] & 0x7F
        mlen = 0
        for (let i = 0; i < lenBytes; i++) mlen = (mlen << 8) | derPublicKey[++o]
        o++
    } else {
        mlen = derPublicKey[o++]
    }
    let mod = derPublicKey.slice(o, o + mlen)
    if (mod[0] === 0x00 && mod.length === 129) mod = mod.slice(1)
    return mod
}

class AESSession {
    constructor(private key: Buffer) {}

    encrypt(data: Buffer): Buffer {
        const padded = Buffer.alloc(Math.ceil(data.length / 16) * 16, 0)
        data.copy(padded)
        const cipher = crypto.createCipheriv('aes-128-ecb', this.key, null)
        cipher.setAutoPadding(false)
        return Buffer.concat([cipher.update(padded), cipher.final()])
    }

    decrypt(data: Buffer): Buffer {
        const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, null)
        decipher.setAutoPadding(false)
        return Buffer.concat([decipher.update(data), decipher.final()])
    }
}

// ── MTechClient ───────────────────────────────────────────────────────────────

export class MTechClient {

    private log(msg: string): void {
        console.log(`${new Date().toLocaleString()} [MTech] ${msg}`)
    }

    /**
     * Connect to the panel, authenticate, execute one arm/disarm command, disconnect.
     * Resolves on success, rejects with an Error on failure.
     */
    async sendCommand(config: MTechConfig, action: MTechAction): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const socket = new net.Socket()
            socket.setNoDelay(true)

            let rxBuffer = Buffer.alloc(0)
            let resolveMsg: ((d: Buffer) => void) | null = null
            const msgQueue: Buffer[] = []
            let encryptedPhase = false

            const deliverMsg = (msg: Buffer) => {
                if (resolveMsg) { resolveMsg(msg); resolveMsg = null }
                else msgQueue.push(msg)
            }

            socket.on('data', (data: Buffer) => {
                rxBuffer = Buffer.concat([rxBuffer, data])
                if (!encryptedPhase) {
                    // Handshake: deliver entire buffer as one message
                    deliverMsg(rxBuffer)
                    rxBuffer = Buffer.alloc(0)
                } else {
                    // Post-handshake: 16-byte AES blocks
                    while (rxBuffer.length >= 16) {
                        deliverMsg(rxBuffer.slice(0, 16))
                        rxBuffer = rxBuffer.slice(16)
                    }
                }
            })

            const waitMsg = (ms = 5000): Promise<Buffer> => new Promise((res, rej) => {
                if (msgQueue.length) { res(msgQueue.shift()!); return }
                const t = setTimeout(() => { resolveMsg = null; rej(new Error(`timeout after ${ms}ms`)) }, ms)
                resolveMsg = (d) => { clearTimeout(t); res(d) }
            })

            const finish = (err?: Error) => {
                socket.destroy()
                if (err) { this.log(`Error: ${err.message}`); reject(err) }
                else resolve()
            }

            socket.on('error', (err) => finish(err))

            socket.connect(config.panelPort, config.panelIp, async () => {
                try {
                    this.log(`Connected to ${config.panelIp}:${config.panelPort}, sending ${action}...`)

                    // ── Step 1: SendPres ──────────────────────────────────────
                    await new Promise(r => setTimeout(r, 300))
                    socket.write(buildPacket(ADDR_CLIENT, 0x05, HELLO_DATA))
                    await waitMsg(10000)   // PresReply

                    // ── Step 2: Generate RSA-1024 key pair (e=3) ─────────────
                    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                        modulusLength: 1024,
                        publicExponent: 3,
                        publicKeyEncoding: { type: 'pkcs1', format: 'der' },
                        privateKeyEncoding: { type: 'pkcs1', format: 'der' },
                    })

                    const pub = crypto.createPublicKey({ key: Buffer.from(publicKey), format: 'der', type: 'pkcs1' })
                    const modDER = pub.export({ type: 'pkcs1', format: 'der' }) as Buffer
                    const modBE = extractRSAModulus(modDER)

                    // Panel uses little-endian byte order for RSA
                    const modLE = Buffer.alloc(128)
                    for (let i = 0; i < 128; i++) modLE[i] = modBE[127 - i]

                    const ppkData = Buffer.alloc(131)
                    ppkData[0] = 0x01; ppkData[1] = 0x00; ppkData[2] = 0x01
                    modLE.copy(ppkData, 3)
                    socket.write(buildPacket(ADDR_CLIENT, 0x08, ppkData))

                    // ── Step 3: PPK reply → extract AES session key ───────────
                    const ppkRaw = await waitMsg(10000)
                    const ppkPkt = parsePacket(ppkRaw)

                    // RSA ciphertext is little-endian on wire; reverse to big-endian for Node.js
                    const rsaBlockLE = ppkPkt.data.slice(0, 128)
                    const rsaBlockBE = Buffer.alloc(128)
                    for (let i = 0; i < 128; i++) rsaBlockBE[i] = rsaBlockLE[127 - i]

                    const privKey = crypto.createPrivateKey({
                        key: Buffer.from(privateKey), format: 'der', type: 'pkcs1'
                    })
                    const decryptedBE = crypto.privateDecrypt(
                        { key: privKey, padding: crypto.constants.RSA_NO_PADDING },
                        rsaBlockBE
                    )

                    // Plaintext also little-endian; reverse to get actual bytes
                    const plaintext = Buffer.alloc(decryptedBE.length)
                    for (let i = 0; i < decryptedBE.length; i++) plaintext[i] = decryptedBE[decryptedBE.length - 1 - i]

                    // AES session key is at offset 20..36 in the plaintext
                    const aes = new AESSession(plaintext.slice(20, 36))
                    encryptedPhase = true

                    const sendEnc = (addr: number, func: number, rawD: Buffer) => {
                        const inner = buildPacket(addr, func, rawD)
                        const withLen = Buffer.alloc(Math.ceil((inner.length + 1) / 16) * 16, 0)
                        withLen[0] = inner.length
                        inner.copy(withLen, 1)
                        socket.write(aes.encrypt(withLen))
                    }

                    // ── Step 4: Authenticate ──────────────────────────────────
                    const pin = config.userPin
                    const pinBuf = Buffer.from(pin, 'ascii')

                    // 4a. UserPin
                    const userPinData = Buffer.alloc(pinBuf.length + 5)
                    userPinData[0] = pinBuf.length + 2
                    userPinData[1] = 0xBE; userPinData[2] = 0x00; userPinData[3] = 0x01
                    userPinData[4] = pinBuf.length + 1
                    pinBuf.copy(userPinData, 5)
                    sendEnc(ADDR_CLIENT, 0x06, userPinData)
                    await new Promise(r => setTimeout(r, 100))

                    // 4b. PinLength
                    sendEnc(ADDR_CLIENT, 0x06, Buffer.from([0x01, 0xBE, 0x00, 0x02, pin.length]))
                    await new Promise(r => setTimeout(r, 100))

                    // 4c. UserIndex
                    sendEnc(ADDR_CLIENT, 0x06, Buffer.from([
                        0x02, 0xBE, 0x00, 0x03,
                        (config.userIndex >> 8) & 0xFF, config.userIndex & 0xFF
                    ]))
                    await new Promise(r => setTimeout(r, 100))

                    // 4d. ConnectionPassword (empty)
                    sendEnc(ADDR_CLIENT, 0x06, Buffer.from([0x02, 0xBE, 0x00, 0x04, 0x01]))
                    await new Promise(r => setTimeout(r, 300))

                    // Drain auth ACKs
                    for (let i = 0; i < 5; i++) { try { await waitMsg(500) } catch { break } }

                    // fetchAuthResult
                    sendEnc(ADDR_CLIENT, 0x05, Buffer.from([0xBE, 0x00, 0x00]))
                    try { await waitMsg(2000) } catch { /* ignore timeout */ }
                    await new Promise(r => setTimeout(r, 300))

                    // ── Step 5: Send arm/disarm command ──────────────────────
                    const GROUP = 0x00
                    if (action === 'arm_away') {
                        sendEnc(ADDR_CLIENT, 0x06, Buffer.from([0x02, 0xBF, 0x00, 0x00, GROUP, 0x01]))
                    } else if (action === 'arm_home') {
                        sendEnc(ADDR_CLIENT, 0x06, Buffer.from([0x02, 0xBF, 0x00, 0x00, GROUP, 0x02]))
                    } else if (action === 'arm_night') {
                        sendEnc(ADDR_CLIENT, 0x06, Buffer.from([0x02, 0xBF, 0x00, 0x00, GROUP, 0x03]))
                    } else {
                        sendEnc(ADDR_CLIENT, 0x06, Buffer.from([0x01, 0xC0, 0x00, 0x00, GROUP]))
                    }

                    // Wait for panel ACK (up to 5 seconds)
                    for (let i = 0; i < 5; i++) {
                        try {
                            const msg = await waitMsg(3000)
                            if (msg.length >= 16) {
                                const d = aes.decrypt(msg)
                                const p = parsePacket(d.slice(1, 1 + d[0]))
                                this.log(`ACK: func=0x${p.func.toString(16)} data=${p.data.toString('hex')}`)
                                if (p.func === 0x86 || p.func === 0x85) break
                            }
                        } catch { break }
                    }

                    this.log(`${action} completed`)
                    finish()

                } catch (e) {
                    finish(e as Error)
                }
            })
        })
    }
}
