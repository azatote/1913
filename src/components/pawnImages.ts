import type { ResourceId } from '../game/cardData'
import type { CampaignPawnId } from '../game/types'
import factoryPawnUrl from '../assets/plateau/pion_piste_bleu_usine.png'
import moneyPawnUrl from '../assets/plateau/pion_piste_jaune_monnaie.png'
import industryPawnUrl from '../assets/plateau/pion_piste_rouge_industrie.png'
import populationPawnUrl from '../assets/plateau/pion_piste_violet_population.png'
import francePawnUrl from '../assets/plateau/pion_france.png'
import unitedKingdomPawnUrl from '../assets/plateau/pion_royaumeuni.png'
import russiaPawnUrl from '../assets/plateau/pion_russe.png'

export const PAWN_IMAGES: Record<CampaignPawnId, string> = {
  money: moneyPawnUrl,
  population: populationPawnUrl,
  industry: industryPawnUrl,
  factory: factoryPawnUrl,
  france: francePawnUrl,
  unitedKingdom: unitedKingdomPawnUrl,
  russia: russiaPawnUrl,
}

// Keyed by the country name used in cardData.ts.
export const COUNTRY_PAWN_IMAGES: Record<string, string> = {
  France: francePawnUrl,
  'Royaume-Uni': unitedKingdomPawnUrl,
  'Empire russe': russiaPawnUrl,
}

// Same colors as the resource icons on the cards: logistics is blue, transport is red.
export const RESOURCE_PAWN_IMAGES: Record<ResourceId, string> = {
  money: moneyPawnUrl,
  population: populationPawnUrl,
  logistics: factoryPawnUrl,
  transport: industryPawnUrl,
}
