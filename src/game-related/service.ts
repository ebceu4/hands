import { IWavesApi } from '../api'
import { IKeeper } from '../keeper/interfaces'
import { apiHelpers } from '../helpers'
import { gameBet, hideMoves, whoHasWon, serviceCommission, serviceAddress } from './game'
import { randomAccount } from './core'
import { base58decode as from58, address } from '@waves/waves-crypto'
import { compiledScript } from './contract'
import { IMatch, MatchStatus, MatchResult } from './interfaces'
import { environment } from './environment'


export interface CreateMatchResult {
  move: Uint8Array
  moveHash: Uint8Array
  match: IMatch
}

export const service = async (api: IWavesApi, keeper: IKeeper) => {
  const config = api.config()
  const { setKeysAndValues, setScript, massTransferWaves } = apiHelpers(api)

  return {

    create: async (moves: number[]): Promise<CreateMatchResult> => {
      const { seed: matchSeed, address: matchAddress, publicKey: matchKey } = randomAccount(config.chainId)

      //#STEP1 P1 => C (+GameBet)
      const p1p = await keeper.prepareWavesTransfer(matchAddress, gameBet)
      const { id: p1PaymentId, senderPublicKey: player1Key } = await api.broadcastAndWait(p1p)
      const { move, moveHash } = hideMoves(moves)

      //#STEP2# C => data
      await setKeysAndValues({ seed: matchSeed }, { 'p1k': from58(player1Key), 'p1mh': moveHash, 'mk': from58(matchKey), })
      //#STEP3# C => script
      await setScript(matchSeed, compiledScript)

      return {
        move,
        moveHash,
        match: {
          address: matchAddress,
          publicKey: matchKey,
          status: MatchStatus.New,
          creator: {
            address: address({ public: player1Key }, config.chainId),
            publicKey: player1Key,
          },
        },
      }
    },

    join: async (match: IMatch, moves: number[]): Promise<void> => {
      if (match.opponent)
        throw new Error('Match is already taken')

      const config = api.config()
      const { setKeysAndValues } = apiHelpers(api)
      const matchKey = match.publicKey
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
    },

    reveal: async (match: IMatch, move: Uint8Array, api: IWavesApi) => {
      const { setKeysAndValues } = apiHelpers(api)

      //#STEP7# P1 => reveal
      await setKeysAndValues({ publicKey: match.publicKey }, { 'p1m': move })
    },

    payout: async (match: IMatch) => {

      if (!match.reservationHeight)
        throw new Error('There is no reservation height on match')

      if (!match.opponent)
        throw new Error('Match opponent is empty')

      let w: MatchResult = MatchResult.Draw

      const h = await api.getHeight()
      if (h - match.reservationHeight > environment.creatorRevealBlocksCount) {
        if (!match.creator.moves && !match.opponent!.moves) w = MatchResult.Draw
        else if (!match.creator.moves) w = MatchResult.Opponent
        else w = MatchResult.Creator
      } else {
        if (!match.creator.moves || !match.opponent.moves)
          throw new Error('There is no moves to determine a winner')

        w = whoHasWon(match.creator.moves, match.opponent.moves)!
      }

      const winner = w == MatchResult.Opponent ? match.opponent.address : match.creator.address
      const looser = w == MatchResult.Opponent ? match.creator.address : match.opponent.address

      //#STEP8# payout
      const matchBalance = (await api.getBalance(match.address)) - serviceCommission - 700000
      await massTransferWaves({ publicKey: match.publicKey }, {
        [serviceAddress]: serviceCommission,
        [winner]: w == MatchResult.Draw ? matchBalance / 2 : matchBalance,
        [looser]: w == MatchResult.Draw ? matchBalance / 2 : 0,
      }, { fee: 700000 })
    },

  }
}






