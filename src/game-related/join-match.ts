import { IWavesApi } from '../api'
import { IKeeper } from '../keeper/interfaces'
import { apiHelpers } from '../helpers'
import { gameBet, hideMoves } from './game'
import { base58decode as from58, address } from '@waves/waves-crypto'

export const joinMatch = async (matchKey: string, moves: number[], api: IWavesApi, keeper: IKeeper): Promise<void> => {
  const config = api.config()
  const { setKeysAndValues } = apiHelpers(api)
  const matchAddress = address({ public: matchKey }, config.chainId)
  //#STEP4# P2 => bet
  const p2p = await keeper.prepareWavesTransfer(matchAddress, gameBet)
  const { id: p2PaymentId, senderPublicKey: player2Key } = await api.broadcastAndWait(p2p)
  const { move, moveHash } = hideMoves(moves)
  //#STEP5# P2 => move
  const h = await api.getHeight()
  await setKeysAndValues({ publicKey: matchKey }, { 'p2k': from58(player2Key), 'p2mh': moveHash, 'h': h, 'p2p': from58(p2PaymentId) })
  //#STEP6# P2 => reveal
  await setKeysAndValues({ publicKey: matchKey }, { 'p2m': move })
}
