import { conf, testingHostSeed } from '../settings'
import { axiosHttp } from '../../src/api-axios'
import { api as apiCtor } from '../../src/api'
import { tests, printAddress, bruteForce, oneOf } from '..'
import { apiHelpers } from '../../src/helpers'
import { defaultFee } from '../fees'
import { base58decode as from58, address, publicKey, base58encode } from '@waves/waves-crypto'
import { compiledScript } from '../../src/game-related/contract'
import { hideMoves, gameBet, serviceCommission, serviceAddress } from '../../src/game-related/game'
import { service } from '../../src/game-related/service'
import { IKeeper, KeeperAuth, KeeperPublicState } from '../../src/keeper/interfaces'
import { transfer, TTx, ITransferTransaction } from '@waves/waves-transactions'
import { BASE64_STRING } from '@waves/marshall/dist/serializePrimitives'
import { MatchStatus, IMatch, MatchResult } from '../../src/game-related/interfaces'

jest.setTimeout(1000 * 60 * 60)

const api = apiCtor(conf, axiosHttp)
const config = api.config()
const keeperMock = (seeds: string[]): IKeeper => {

  let i = 0

  return {
    on: (event: string, cb: (state: any) => void) => { },
    auth: (param?: { data: string }): Promise<KeeperAuth> => Promise.resolve<KeeperAuth>({
      address: '',
      data: '',
      host: 'string',
      prefix: 'WavesWalletAuthentication',
      publicKey: '',
      signature: 'string',
    }),
    signTransaction: (p: { type: number, data: any }): Promise<TTx> => Promise.resolve(transfer({ recipient: '', amount: 1 }, '')),
    prepareWavesTransfer: (recipient: string, amount: number): Promise<ITransferTransaction> => Promise.resolve(transfer({ recipient, amount }, seeds[i++])),
    publicState: (): Promise<KeeperPublicState> => Promise.resolve<KeeperPublicState>({
      initialized: false,
      locked: false,
    }),
  }
}

const createPlayers = async () => {
  const [
    { seed: player1Seed, address: player1Address },
    { seed: player2Seed, address: player2Address },
  ] = await Promise.all(
    [randomAccountWithBalance(gameBet + defaultFee.transfer),
    randomAccountWithBalance(gameBet + defaultFee.transfer)]
  )

  return { player1Address, player2Address, player1Seed, player2Seed }
}

const playFullMatch = async (p1Moves: number[], p2Moves: number[]) => {

  const { player1Address, player2Address, player1Seed, player2Seed } = await createPlayers()
  const s = service(api, keeperMock([player1Seed, player2Seed]))

  const { match, move: p1Move, moveHash: p1MoveHash } = await s.create(p1Moves)

  await s.join(match, p2Moves)

  await s.reveal(match, p1Move)

  await s.payout(match)

  const [p1Balance, p2Balance] = await Promise.all([api.getBalance(player1Address), api.getBalance(player2Address)])

  return { p1Balance, p2Balance, player1Seed, player2Seed }
}

const createMatch = async (p1Moves: number[]) => {
  const { seed: player1Seed } = await randomAccountWithBalance(gameBet + defaultFee.transfer)
  const s = service(api, keeperMock([player1Seed]))

  const { match, move: p1Move, moveHash: p1MoveHash } = await s.create(p1Moves)

  return { player1Seed, p1Move, p1MoveHash, match }
}

const { randomAccountWithBalance } = tests(testingHostSeed, api)

it('create match and matches', async () => {

  const p1Moves = [1, 1, 1]
  const p2Moves = [2, 2, 2]

  const { player1Address, player2Address, player1Seed, player2Seed } = await createPlayers()
  const s = service(api, keeperMock([player1Seed, player2Seed]))

  const { match, move: p1Move, moveHash: p1MoveHash } = await s.create(p1Moves)

  let m: IMatch

  m = (await s.matches()).filter(m => m.address == match.address)[0]
  expect(m.status).toBe(MatchStatus.WaitingForP2)

  await s.join(match, p2Moves)

  m = (await s.matches()).filter(m => m.address == match.address)[0]
  expect(m.status).toBe(MatchStatus.WaitingP1ToReveal)

  await s.reveal(match, p1Move)

  m = (await s.matches()).filter(m => m.address == match.address)[0]
  expect(m.status).toBe(MatchStatus.WaitingForPayout)

  await s.payout(match)

  m = (await s.matches()).filter(m => m.address == match.address)[0]
  expect(m.status).toBe(MatchStatus.Done)
  expect(m.result).toBe(MatchResult.Opponent)

  const [p1Balance, p2Balance] = await Promise.all([api.getBalance(player1Address), api.getBalance(player2Address)])

  expect(p1Balance).toBe(0)
  expect(p2Balance).toBeGreaterThan(gameBet)
})

xit('match sunny day', async () => {
  const { p1Balance, p2Balance } = await playFullMatch([1, 1, 1], [2, 2, 2])

  expect(p1Balance).toBe(0)
  expect(p2Balance).toBeGreaterThan(gameBet)
})

xit('payout', async () => {

  const s = service(api, keeperMock([]))

  const player1Key = base58encode(BASE64_STRING('Msw1V6G9UqgmsEjyu2IxQZkRvSv0lUrFbmzcAtw5FCs='))
  const player2Key = base58encode(BASE64_STRING('ayMGm4zZ2cUeCFGVkRv/9nwlKcwbeSgIoFlZf6qrczg='))
  const matchKey = base58encode(BASE64_STRING('2wgFQsM5PWqe2TOMdJHOIxgkQ719OApkPlhf0ELxsFY='))
  const matchAddress = address({ public: matchKey }, config.chainId)
  const p1Moves = BASE64_STRING('AQEBYQ8WLj4JQEyDI8IR2qTMgkI7EqX9bCCaQtgHg8A=')
  const p2Moves = BASE64_STRING('AgIClj04AuZXhu10TqvZjU8WJnG6VWGJwROe2wBtzOY=')
  await s.payout(
    {
      address: matchAddress,
      publicKey: matchKey,
      status: MatchStatus.WaitingForPayout,
      reservationHeight: 490893,
      creator: {
        address: address({ public: player1Key }, config.chainId),
        publicKey: player1Key,
        moves: [p1Moves[0], p1Moves[1], p1Moves[2]],
      },
      opponent: {
        address: address({ public: player2Key }, config.chainId),
        publicKey: player2Key,
        moves: [p2Moves[0], p2Moves[1], p2Moves[2]],
      },
    })
})