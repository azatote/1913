export type ResourceId = 'money' | 'population' | 'logistics' | 'transport'

export const RESOURCES: { id: ResourceId; label: string }[] = [
  { id: 'money', label: 'Argent' },
  { id: 'population', label: 'Population' },
  { id: 'logistics', label: 'Logistique' },
  { id: 'transport', label: 'Transport' },
]

export type CardData = {
  code: number
  title: string
  country: string
  radios: { rightTop: boolean; leftTop: boolean; rightBottom: boolean; leftBottom: boolean }
  resources: Record<ResourceId, boolean>
}

// Source: 1913Vscode.csv. Radios: droite haut, gauche haut, droite bas, gauche bas. Ressources: argent, population, logistique, transport.
const ROWS: [number, string, string, string, string][] = [
  [1, 'TRANCHÉES FRANÇAISES', 'France', '1111', '1000'],
  [2, 'FORT DE VERDUN', 'France', '1111', '1000'],
  [3, 'GARE MILITAIRE', 'France', '1101', '0100'],
  [4, 'ATELIER RENAULT FT', 'France', '1011', '0100'],
  [5, 'USINE D’OBUS', 'France', '0011', '0100'],
  [6, 'ÉTAT-MAJOR', 'France', '1001', '1001'],
  [7, 'HÔPITAL DE CAMPAGNE', 'France', '1100', '0100'],
  [8, 'POSTE DE TÉLÉGRAPHIE', 'France', '1110', '0100'],
  [9, 'CASERNE D’INFANTERIE', 'France', '0111', '1000'],
  [10, 'CAMP D’AVIATION', 'France', '0110', '1001'],
  [11, 'CROISEUR DE BATAILLE', 'France', '0101', '0001'],
  [12, 'CROISEUR D’ARTILLERIE', 'France', '0101', '0001'],
  [13, 'USINE DE MUNITIONS', 'France', '1001', '0001'],
  [14, 'VOIE FERRÉE MILITAIRE', 'France', '1100', '0011'],
  [15, 'ÉCOLE DE PILOTAGE', 'France', '0101', '0001'],
  [16, 'PLACE FORTE', 'France', '1001', '0001'],
  [17, 'DRAGON', 'France', '1010', '0001'],
  [18, 'DÉPÔT D’ESSENCE', 'France', '0011', '0011'],
  [19, 'DÉPÔT DE MATÉRIEL', 'France', '0110', '0010'],
  [20, 'TÉLÉGRAPHIE SANS FIL', 'France', '0101', '0010'],
  [21, 'DÉPÔT DE MUNITIONS', 'France', '1010', '0010'],
  [22, 'POSTE DE COMMANDEMENT', 'France', '0110', '0010'],
  [23, 'CHANTIERS NAVAUX', 'Royaume-Uni', '0110', '0010'],
  [24, 'DOCKS MILITAIRES', 'Royaume-Uni', '1010', '0010'],
  [25, 'QUARTIER GÉNÉRAL BRITANNIQUE', 'Royaume-Uni', '1001', '0010'],
  [26, 'USINE D’ARMEMENT', 'Royaume-Uni', '1010', '0010'],
  [27, 'CENTRE DE RENSEIGNEMENT', 'Royaume-Uni', '1111', '1000'],
  [28, 'AÉRODROME RFC', 'Royaume-Uni', '0111', '1000'],
  [29, 'NAVIRE DE GUERRE', 'Royaume-Uni', '1110', '1010'],
  [30, 'GARE DE RAVITAILLEMENT', 'Royaume-Uni', '1011', '1010'],
  [31, 'ATELIER DE RÉPARATION', 'Royaume-Uni', '1011', '1110'],
  [32, 'CAMPS D’ENTRAÎNEMENT', 'Royaume-Uni', '1110', '1110'],
  [33, 'POSTE DE COMMANDEMENT', 'Royaume-Uni', '0001', '1110'],
  [34, 'HÔPITAL MILITAIRE', 'Royaume-Uni', '0110', '1110'],
  [35, 'DÉPÔT DE MATÉRIEL', 'Royaume-Uni', '0101', '0110'],
  [36, 'TÉLÉGRAPHIE SANS FIL', 'Royaume-Uni', '1001', '0100'],
  [37, 'DÉPÔT DE MUNITIONS', 'Royaume-Uni', '0110', '0100'],
  [38, 'PALAIS IMPÉRIAL', 'Empire russe', '1011', '0100'],
  [39, 'CASERNE COSAQUE', 'Empire russe', '0111', '0110'],
  [40, 'GARE DU TRANSSIBÉRIEN', 'Empire russe', '1011', '1110'],
  [41, 'VILLAGE RUSSE', 'Empire russe', '1101', '1010'],
  [42, 'ÉGLISE ORTHODOXE', 'Empire russe', '0111', '0001'],
  [43, 'MANUFACTURE IMPÉRIALE', 'Empire russe', '1110', '0001'],
  [44, 'CAMP MILITAIRE SIBÉRIALE', 'Empire russe', '1100', '0101'],
  [45, 'DÉPÔT LOGISTIQUE', 'Empire russe', '0011', '0101'],
  [46, 'USINE D’ARMEMENT', 'Empire russe', '1011', '0001'],
  [47, 'ATELIER DE RÉPARATION', 'Empire russe', '1101', '0001'],
  [48, 'POSTE DE COMMANDEMENT', 'Empire russe', '1111', '0001'],
  [49, 'HÔPITAL MILITAIRE', 'Empire russe', '1001', '0101'],
  [50, 'DÉPÔT DE MUNITIONS', 'Empire russe', '1010', '0101'],
  [51, 'TÉLÉGRAPHIE IMPÉRIALE', 'Empire russe', '0101', '0100'],
  [52, 'TRAIN BLINDÉ', 'Empire russe', '1010', '0100'],
  [53, 'DÉPÔT DE RAVITAILLEMENT', 'Empire russe', '0110', '0001'],
  [54, 'ARTILLERIE IMPÉRIALE', 'Empire russe', '1001', '0100'],
  [55, 'CAVALERIE IMPÉRIALE', 'Empire russe', '0101', '0100'],
  [56, 'PONT STRATÉGIQUE', 'Empire russe', '0110', '0101'],
]

export const CARD_DATA = new Map<number, CardData>(ROWS.map(([code, title, country, radios, resources]) => [code, {
  code,
  title,
  country,
  radios: {
    rightTop: radios[0] === '1',
    leftTop: radios[1] === '1',
    rightBottom: radios[2] === '1',
    leftBottom: radios[3] === '1',
  },
  resources: Object.fromEntries(RESOURCES.map(({ id }, index) => [id, resources[index] === '1'])) as Record<ResourceId, boolean>,
}]))
