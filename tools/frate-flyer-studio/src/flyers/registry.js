// Registry de las 6 plantillas — cada una exporta su TEMPLATE meta
// { id, name, Component, stageClass, size(tweaks), eventDemo,
//   tweaksDefault, samples, controls, regenCycle }
import { TEMPLATE as rec } from './rec/FlyerREC.jsx'
import { TEMPLATE as scanner } from './scanner/FlyerScanner.jsx'
import { TEMPLATE as scanner2 } from './scanner2/FlyerScanner2.jsx'
import { TEMPLATE as times } from './times/FlyerTimes.jsx'
import { TEMPLATE as revista } from './revista/FlyerRevista.jsx'
import { TEMPLATE as album } from './album/FlyerAlbum.jsx'

export const TEMPLATES = { rec, scanner, scanner2, times, revista, album }
export const TEMPLATE_ORDER = ['rec', 'scanner', 'scanner2', 'times', 'revista', 'album']
