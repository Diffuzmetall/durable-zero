import { clean } from "./activity.js";
/** Session-scoped Mail identity, also in child views; not a child registration receipt. */
export function renderMailLabel(name, width, theme, truncate) {
    if (!name || width < 12)
        return '';
    const label = clean(name);
    if (!label)
        return '';
    const budget = Math.min(24, Math.floor(width / 3));
    return theme.fg('dim', ' ') + theme.fg('accent', truncate(label, budget)) + theme.fg('dim', ' ─');
}
