import '../ui/puzzle-switcher.js';
import { loadTheme } from '../theme/theme.js';
import { loadBgImage, loadBoardAlpha } from '../theme/background.js';
import { injectSharedSections } from '../ui/shared-sections.js';
import { boot } from '../games/2048/main.js';

loadTheme();
loadBgImage();
loadBoardAlpha();
injectSharedSections();
boot();
