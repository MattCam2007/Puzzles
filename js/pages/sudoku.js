import '../ui/puzzle-switcher.js'; // self-wiring, as the common.js IIFE was
import { loadTheme } from '../theme/theme.js';
import { loadBgImage, loadBoardAlpha } from '../theme/background.js';
import { injectSharedSections } from '../ui/shared-sections.js';
import { boot } from '../games/sudoku/main.js';

loadTheme();
loadBgImage();
loadBoardAlpha(); // before first paint of the board
injectSharedSections();
boot();
