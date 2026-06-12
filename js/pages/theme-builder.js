import { loadTheme } from '../theme/theme.js';
import { loadBgImage, loadBoardAlpha } from '../theme/background.js';
import { boot } from '../theme-builder/main.js';

loadTheme();
loadBgImage();
loadBoardAlpha();
boot();
