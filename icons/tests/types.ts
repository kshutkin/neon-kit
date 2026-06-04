// biome-ignore-all lint: test file

import * as root from '@neon-kit/icons';
import * as outlineAll from '@neon-kit/icons/outline';
import * as solidAll from '@neon-kit/icons/solid';
import bars3Outline from '@neon-kit/icons/outline/bars-3';
import bars3Solid from '@neon-kit/icons/solid/bars-3';
import bars3Mini from '@neon-kit/icons/mini/bars-3';
import bars3Micro from '@neon-kit/icons/micro/bars-3';
import { serialize } from '@neon-kit/icons';

void root;
void outlineAll;
void solidAll;
void bars3Solid;
void bars3Mini;
void bars3Micro;

const serializedIcon: string = serialize(bars3Outline, { size: 20, ariaLabel: 'Menu' });
const iconWidth: number = bars3Outline[0];
const iconHeight: number = bars3Outline[1];
const svgFill: string = bars3Outline[2].fill;
const pathLinecap: string = bars3Outline[3]['stroke-linecap'];
const firstPath: string = bars3Outline[4];
void serializedIcon;
void iconWidth;
void iconHeight;
void svgFill;
void pathLinecap;
void firstPath;
void root.serialize;
