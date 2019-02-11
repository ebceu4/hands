import { IWavesApi } from '../api'
import { IKeeper } from '../keeper/interfaces'
import { apiHelpers } from '../helpers'
import { gameBet, hideMoves, whoHasWon } from './game'
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


export const reveal = async (match: IMatch, move: Uint8Array, api: IWavesApi) => {
  const { setKeysAndValues } = apiHelpers(api)

  //#STEP7# P1 => reveal
  await setKeysAndValues({ publicKey: match.publicKey }, { 'p1m': move })
}

export const finish = async (match: IMatch, api: IWavesApi) => {
  const { setKeysAndValues } = apiHelpers(api)
  let w: MatchResult = MatchResult.Draw

  if (!match.reservationHeight)
    throw new Error('There is no reservation height on match')

  const h = await api.getHeight()
  if (h - match.reservationHeight > environment.creatorRevealBlocksCount) {
    if (!match.creator.moves && !match.opponent!.moves)
      w = MatchResult.Draw
    else if (!match.creator.moves)
      w = MatchResult.Opponent
      else 
      w = MatchResult.Creator
  } else {
    if (!match.opponent || !match.creator.moves || !match.opponent.moves)
      throw new Error('There is no moves to determine a winner')

    w = whoHasWon(match.creator.moves, match.opponent.moves)!
  }

  //#STEP8# winner
  await setKeysAndValues({ publicKey: match.publicKey }, {
    'w': w == MatchResult.Draw ? [0] : w == MatchResult.Creator ? match.creator.publicKey : match.opponent!.publicKey,
  })
}



export const createMatch = async (moves: number[], api: IWavesApi, keeper: IKeeper): Promise<CreateMatchResult> => {
  const config = api.config()
  const { setKeysAndValues, setScript } = apiHelpers(api)
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
}