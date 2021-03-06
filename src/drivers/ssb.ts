/**
 * MMMMM is a mobile app for Secure Scuttlebutt networks
 *
 * Copyright (C) 2017 Andre 'Staltz' Medeiros
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import xs, {Stream, Listener} from 'xstream';
const ssbClient = require('react-native-ssb-client');
const depjectCombine = require('depject');
const sbotOpinion = require('patchcore/sbot');
const Config = require('ssb-config/inject');
const nest = require('depnest');

const emptyHookOpinion = {
  gives: nest('sbot.hook.publish'),
  create: (api: any) => {
    return nest('sbot.hook.publish', () => {});
  }
};

const configOpinion = {
  gives: nest('config.sync.load'),
  create: (api: any) => {
    let config: any;
    return nest('config.sync.load', () => {
      if (!config) {
        config = Config('ssb');
      }
      return config;
    });
  }
};

function makeKeysOpinion(keys: any): any {
  const keysOpinion = {
    needs: nest('config.sync.load', 'first'),
    gives: nest({
      'keys.sync': ['load', 'id']
    }),

    create: (api: any) => {
      return nest({
        'keys.sync': {load, id}
      });
      function id() {
        return load().id;
      }
      function load() {
        return keys;
      }
    }
  };
  return keysOpinion;
}

function xsFromPullStream<T>(pullStream: any): Stream<T> {
  return xs.create({
    start(listener: Listener<T>): void {
      const drain = function drain(read: Function) {
        read(null, function more(end: any | boolean, data: T) {
          if (end === true) {
            listener.complete();
            return;
          }
          if (end) {
            listener.error(end);
            return;
          }
          listener.next(data);
          read(null, more);
        });
      };
      try {
        drain(pullStream);
      } catch (e) {
        listener.error(e);
      }
    },
    stop(): void {}
  });
}

export function ssbDriver(): Stream<any> {
  const keys$ = xs.fromPromise(ssbClient.fetchKeys(Config('ssb')));

  const api$ = keys$.map(keys => {
    return depjectCombine([
      emptyHookOpinion,
      configOpinion,
      makeKeysOpinion(keys),
      sbotOpinion
    ]);
  });

  const feed$ = api$
    .map(api =>
      xsFromPullStream<any>(
        api.sbot.pull.feed[0]({reverse: false, limit: 100, live: true})
      )
    )
    .flatten();

  return feed$;
}
