import { oneOf } from '../test'
import '../src/extensions'
import * as progress from 'cli-progress'


const bar = new progress.Bar({}, progress.Presets.shades_classic)



bar.start(100, 0)
bar.update(50)

bar.stop()