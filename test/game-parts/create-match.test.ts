import { conf, testingHostSeed } from '../settings'
import { axiosHttp } from '../../src/api-axios'
import { api as apiCtor } from '../../src/api'
import { tests, printAddress, bruteForce, oneOf } from '..'
import { apiHelpers } from '../../src/helpers'
import { defaultFee } from '../fees'
import { base58decode as from58 } from '@waves/waves-crypto'
import { compiledScript } from '../../src/game-related/contract'
import { hideMoves, gameBet, serviceCommission, serviceAddress } from '../../src/game-related/game'
import { createMatch } from '../../src/game-related/create-match'

jest.setTimeout(1000 * 60 * 60)

const api = apiCtor(conf, axiosHttp)
const { transferWaves, massTransferWaves, setKeysAndValues, setScript } = apiHelpers(api)
const { randomAccountWithBalance, randomAccount } = tests(testingHostSeed, api)

xit('create match', async () => {
  const { seed: player1Seed, publicKey: player1Key, address: player1Address } =
    await randomAccountWithBalance(gameBet + defaultFee.transfer)

  hideMoves([0, 1, 2])
  //createMatch()



})