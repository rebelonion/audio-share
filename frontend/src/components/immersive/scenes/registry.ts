import {travelerScene} from './traveler';
import {nightTrainScene} from './night-train';
import {shrinePathScene} from './shrine-path';
import {desertDuskScene} from './desert-dusk';
import {underwaterDriftScene} from './underwater-drift';
import {riverLanternsScene} from './river-lanterns';
import {moonlitPondScene} from './moonlit-pond';
import type {SceneDefinition} from './types';

export const scenes: readonly SceneDefinition[] = [travelerScene, nightTrainScene, shrinePathScene, desertDuskScene, underwaterDriftScene, riverLanternsScene, moonlitPondScene];
export const defaultScene = travelerScene;
