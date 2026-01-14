// Type declarations for virtual modules

declare module 'virtual:astro-prerender-config' {
    /** Base URL path (e.g., '/my-subdir') */
    export const base: string;
    /** Full path to prerendered files (e.g., '/my-subdir/prerendered') */
    export const prerenderedPath: string;
    /** Full path to the CSS file (e.g., '/my-subdir/prerendered/lazy-components.css') */
    export const cssPath: string;
}
