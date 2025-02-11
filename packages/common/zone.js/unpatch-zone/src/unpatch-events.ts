import { Any } from '@angular-ru/common/typings';

// eslint-disable-next-line max-lines-per-function
export function unpatchEvents(): void {
    if (typeof window !== 'undefined') {
        const windowInstance: Window & Any = window as Any;

        if (windowInstance['Zone']) {
            throw new Error('You must import `@angular-ru/common/zone.js/unpatch-events` before importing rxjs');
        }

        windowInstance['__zone_symbol__UNPATCHED_EVENTS'] = [
            'scroll',
            'mouseenter',
            'mouseleave',
            'mousemove',
            'mouseover',
            'mouseout',
            'mousewheel',
            'message'
        ];

        // black list scroll event handler for onProp
        const targets: Any[] = [window, Document, HTMLBodyElement, HTMLElement, document.body, WebSocket];

        windowInstance['__Zone_ignore_on_properties'] = [];

        for (const target of targets) {
            windowInstance['__Zone_ignore_on_properties']?.push({
                target,
                ignoreProperties: [
                    'scroll',
                    'mouseenter',
                    'mouseleave',
                    'mousemove',
                    'mouseover',
                    'mouseout',
                    'mousewheel',
                    'dragover',
                    'drop',
                    'close',
                    'error',
                    'open',
                    'message'
                ]
            });
        }
    }
}
