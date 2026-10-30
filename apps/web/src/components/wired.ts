import { createContext } from 'react';

/**
 * Labels of the selected block's data plugs that have a wire going into them: the
 * setting with that label is then decided by the wire, not by the panel.
 */
export const WiredContext = createContext<ReadonlySet<string>>(new Set());
