import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Any, PlainObject } from '@angular-ru/common/typings';
import { tryParseJson } from '@angular-ru/common/utils';
import { Observable, ReplaySubject, Subject, Subscription, throwError } from 'rxjs';
import { WebSocketMessage } from 'rxjs/internal/observable/dom/WebSocketSubject';
import { catchError, filter, map, take, takeUntil } from 'rxjs/operators';
import { webSocket, WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/webSocket';

import { WebsocketHandler } from '../interfaces/websocket-handler';
import { WebsocketMessage } from '../interfaces/websocket-message';
import { WebsocketConfig } from './websocket-config';

export const PLAIN_TEXT: PlainObject = {};
export const BINARY: PlainObject = {};

@Injectable()
export abstract class AbstractWebsocketClient<K extends string | PlainObject>
    implements WebsocketHandler<K>, OnDestroy
{
    public connected$: ReplaySubject<Event> = new ReplaySubject();
    public disconnected$: ReplaySubject<Event> = new ReplaySubject();
    public destroy$: Subject<boolean> = new Subject<boolean>();
    protected readonly messages$: Subject<WebsocketMessage<K, Any>> = new Subject();
    private connected: boolean = false;
    private socket$!: WebSocketSubject<WebsocketMessage<K, Any>>;
    private subscription!: Subscription;
    private handlerPath!: string;

    protected constructor(private readonly wsConfig: WebsocketConfig, private readonly ngZone: NgZone) {}

    public get isConnected(): boolean {
        return this.connected;
    }

    public get isDisconnected(): boolean {
        return !this.connected;
    }

    public abstract get baseUrl(): string;

    public get connectionPath(): string {
        return `${this.baseUrl}${this.handlerPath}`;
    }

    private get webSocketSubjectConfig(): WebSocketSubjectConfig<Any> {
        return {
            openObserver: { next: (event: Event): void => this.onOpenObserver(event) },
            closeObserver: { next: (event: Event): void => this.onCloseObserver(event) },
            serializer: (message: Any): WebSocketMessage => this.serialize(message),
            deserializer: (event: MessageEvent): Any => this.deserialize(event),
            url: this.connectionPath,
            binaryType: this.wsConfig.binaryType
        };
    }

    private static isArrayBuffer(value: Any): value is ArrayBuffer | Blob {
        return value instanceof ArrayBuffer || value instanceof Blob;
    }

    public onConnected(_event?: Event): void {
        // noop
    }

    public onDisconnected(_event?: Event): void {
        // noop
    }

    public connect(path: string): void {
        this.handlerPath = path;
        this.ngZone.runOutsideAngular((): void => this._connect());
        this.destroy$ = new Subject<boolean>();
    }

    public disconnect(): void {
        this.subscription?.unsubscribe();
        this.socket$?.unsubscribe();
        this.destroy$.next(true);
        this.destroy$.complete();
    }

    public on<T = void>(type: K): Observable<T> {
        return this.messages$.pipe(
            filter((message: WebsocketMessage<K, T>): boolean => message.type === type),
            map((message: WebsocketMessage<K, T>): T => message.data),
            catchError((err: Error): Observable<never> => throwError(err)),
            takeUntil(this.destroy$)
        );
    }

    public single<T = void>(type: K): Observable<T> {
        return this.on<T>(type).pipe(take(1));
    }

    public sendMessage<T>(type: K, data: T): void {
        this.socket$.next({ type, data });
    }

    public ngOnDestroy(): void {
        this.disconnect();
    }

    protected serialize(message: WebsocketMessage<K, Any>): WebSocketMessage {
        switch (message.type) {
            case BINARY:
            case PLAIN_TEXT:
                return message.data;
            default:
                return JSON.stringify(message);
        }
    }

    protected deserialize({ data }: MessageEvent): WebsocketMessage<Any, Any> {
        if (AbstractWebsocketClient.isArrayBuffer(data)) {
            return { type: BINARY, data };
        } else {
            return tryParseJson<WebsocketMessage<Any, Any>>(data) ?? { type: PLAIN_TEXT, data };
        }
    }

    private onOpenObserver(event: Event): void {
        this.connected = true;
        this.connected$.next(event);
        this.onConnected(event);
    }

    private onCloseObserver(event: Event): void {
        this.connected = false;
        this.disconnected$.next(event);
        this.onDisconnected(event);
    }

    private _connect(): void {
        this.socket$ = webSocket(this.webSocketSubjectConfig);
        this.subscription = this.socket$.pipe(takeUntil(this.destroy$)).subscribe(
            (message: WebsocketMessage<K, Any>): void => {
                window.requestAnimationFrame((): void => this.messages$.next(message));
            },
            (): void => this.reconnect()
        );
    }

    private reconnect(): void {
        if (!this.socket$.isStopped) {
            this.socket$.complete();
        }
        if (!this.subscription.closed) {
            this.subscription.unsubscribe();
        }

        this.ngZone.runOutsideAngular((): void => {
            window.setTimeout((): void => this._connect(), this.wsConfig.reconnectionDelay);
        });
    }
}
