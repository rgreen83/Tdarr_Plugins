import { getFileName } from '../../../../FlowHelpers/1.0.0/fileUtils';
import {
  IpluginDetails,
  IpluginInputArgs,
  IpluginOutputArgs,
} from '../../../../FlowHelpers/1.0.0/interfaces/interfaces';

const details = (): IpluginDetails => ({
  name: 'Notify Radarr or Sonarr',
  description: 'Notify Radarr or Sonarr to refresh after file change. '
    + 'This plugin should be called after the original file has been replaced and '
    + 'after the applyRadarrorSonarrNamingPolicy plugin. '
    + 'You can use TMDB, TVDB, or IMDB if following TRaSH Guides naming convention - '
    + 'ID must be in file name, not only folder name. '
    + 'Radarr expects {tmdb-{TmdbId}} or {imdb-{ImdbId}}, TMDB preferred. '
    + 'Sonarr expects {{tvdb-{TvdbId}} or {{imdb-{ImdbId}}, TVDB preferred - '
    + 'also yes Sonarr has a bug that requires an extra opening curly brace {. '
    + 'If no DB ID found, will fallback to parsing full filename and '
    + 'also supports "TitleThe" naming (better sorting).',
  style: {
    borderColor: 'green',
  },
  tags: '',
  isStartPlugin: false,
  pType: '',
  requiresVersion: '2.11.01',
  sidebarPosition: -1,
  icon: 'faBell',
  inputs: [
    {
      label: 'Arr',
      name: 'arr',
      type: 'string',
      defaultValue: 'radarr',
      inputUI: {
        type: 'dropdown',
        options: ['radarr', 'sonarr'],
      },
      tooltip: 'Specify which arr to use',
    },
    {
      label: 'Arr API Key',
      name: 'arr_api_key',
      type: 'string',
      defaultValue: '',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your arr api key here',
    },
    {
      label: 'Arr Host',
      name: 'arr_host',
      type: 'string',
      defaultValue: 'http://192.168.1.1:7878',
      inputUI: {
        type: 'text',
      },
      tooltip: 'Input your arr host here.'
        + '\\nExample:\\n'
        + 'http://192.168.1.1:7878\\n'
        + 'http://192.168.1.1:8989\\n'
        + 'https://radarr.domain.com\\n'
        + 'https://sonarr.domain.com\\n',
    },
  ],
  outputs: [
    {
      number: 1,
      tooltip: 'Radarr or Sonarr notified',
    },
    {
      number: 2,
      tooltip: 'Radarr or Sonarr do not know this file',
    },
  ],
});

interface IHTTPHeaders {
  'Content-Type': string,
  'X-Api-Key': string,
  Accept: string,
}
interface IParseResponse {
  data: {
    movie?: { id: number },
    series?: { id: number },
  },
}
interface IArrApp {
  name: string,
  host: string,
  headers: IHTTPHeaders,
  content: string,
  delegates: {
    getIdFromParseResponse: (parseResponse: IParseResponse) => number,
    buildRefreshResquestData: (id: number) => string
  }
}

const getId = async (
  args: IpluginInputArgs,
  arrApp: IArrApp,
  fileName: string,
)
  : Promise<number> => {
  const idCheck = getFileName(fileName);
  let id = -1;
  if (idCheck.includes('tmdb-')) {
    const tmdbId = fileName.match(/\{tmdb-(\d+)}/)?.at(1) ?? '';
    args.jobLog(`${idCheck} includes tmdb- '${tmdbId}'`);
    const urlTmdb = `${arrApp.host}/api/v3/${arrApp.name === 'radarr' ? 'movie' : 'series'}/lookup?term=tmdb:${tmdbId}`;
    args.jobLog(`Request URL: ${urlTmdb}`);
    id = (tmdbId !== '')
      ? Number((await args.deps.axios({
        method: 'get',
        url: urlTmdb,
        headers: arrApp.headers,
      })).data?.at(0)?.id ?? -1)
      : -1;
    args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for tmdb '${tmdbId}'`);
  } else if (idCheck.includes('tvdb-')) {
    const tvdbId = fileName.match(/\{tvdb-(\d+)}/)?.at(1) ?? '';
    args.jobLog(`${idCheck} includes tvdb- '${tvdbId}'`);
    const urlTvdb = `${arrApp.host}/api/v3/${arrApp.name === 'radarr' ? 'movie' : 'series'}/lookup?term=tvdb:${tvdbId}`;
    args.jobLog(`Request URL: ${urlTvdb}`);
    id = (tvdbId !== '')
      ? Number((await args.deps.axios({
        method: 'get',
        url: urlTvdb,
        headers: arrApp.headers,
      })).data?.at(0)?.id ?? -1)
      : -1;
    args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for tvdb '${tvdbId}'`);
  } else if (!idCheck.includes('tmdb-') && !idCheck.includes('tvdb-')) {
    const imdbId = /\b(tt|nm|co|ev|ch|ni)\d{7,10}?\b/i.exec(fileName)?.at(0) ?? '';
    args.jobLog(`${idCheck} includes imdb = '${imdbId}'`);
    const urlImdb = `${arrApp.host}/api/v3/${arrApp.name === 'radarr' ? 'movie' : 'series'}/lookup?term=imdb:${imdbId}`;
    args.jobLog(`Request URL: ${urlImdb}`);
    id = (imdbId !== '')
      ? Number((await args.deps.axios({
        method: 'get',
        url: urlImdb,
        headers: arrApp.headers,
      })).data?.at(0)?.id ?? -1)
      : -1;
    args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for imdb '${imdbId}'`);
  }
  if (id === -1) {
    const theTitle = getFileName(fileName);
    const year = /\(\d{4}\)/;
    const theSplits = [', The', ', The ', ', The.'];
    const anSplits = [', An', ', An ', ', An.'];
    const aSplits = [', A', ', A ', ', A.'];
    const theTest = theSplits.some((el) => theTitle.includes(el));
    const anTest = anSplits.some((el) => theTitle.includes(el));
    const aTest = aSplits.some((el) => theTitle.includes(el));
    if (theTest === true) {
      // Found titleThe
      const titleThe = theTitle.split(',')[0];
      const titleTheYear = theTitle.split(year)[0];
      // const titleTheRest = theTitle.split(', The')[1];
      const theThe = 'The';
      const theTitleThe = theThe.concat(' ', titleThe);
      const theTitleThe2 = theTitleThe.concat('', titleTheYear);
      args.jobLog(`Variable theTitleThe2 = ${theTitleThe2}`);
      const urlParseThe = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitleThe2)}`;
      args.jobLog(`Request URL: ${urlParseThe}`);
      id = arrApp.delegates.getIdFromParseResponse(
        (await args.deps.axios({
          method: 'get',
          url: urlParseThe,
          headers: arrApp.headers,
        })),
      );
      args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for '${theTitleThe2}'`);
    } else if (anTest === true) {
      // Found titleAn
      const titleThe = theTitle.split(',')[0];
      const titleAnYear = theTitle.split(year)[0];
      // const titleAnRest = theTitle.split(', An')[1];
      const theAn = 'An';
      const theTitleAn = theAn.concat(' ', titleThe);
      const theTitleAn2 = theTitleAn.concat('', titleAnYear);
      args.jobLog(`Variable theTitleAn2 = ${theTitleAn2}`);
      const urlParseAn = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitleAn2)}`;
      args.jobLog(`Request URL: ${urlParseAn}`);
      id = arrApp.delegates.getIdFromParseResponse(
        (await args.deps.axios({
          method: 'get',
          url: urlParseAn,
          headers: arrApp.headers,
        })),
      );
      args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for '${theTitleAn2}'`);
    } else if (aTest === true) {
      // Found titleA
      const titleThe = theTitle.split(',')[0];
      const titleAYear = theTitle.split(year)[0];
      // const titleARest = theTitle.split(', A')[1];
      const theA = 'A';
      const theTitleA = theA.concat(' ', titleThe);
      const theTitleA2 = theTitleA.concat('', titleAYear);
      args.jobLog(`Variable theTitleA2 = ${theTitleA2}`);
      const urlParseA = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitleA2)}`;
      args.jobLog(`Request URL: ${urlParseA}`);
      id = arrApp.delegates.getIdFromParseResponse(
        (await args.deps.axios({
          method: 'get',
          url: urlParseA,
          headers: arrApp.headers,
        })),
      );
      args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for '${theTitleA2}'`);
    } else {
      // Default to regular TheTitle naming convention
      args.jobLog(`Variable theTitle = ${theTitle}`);
      const titleYear = theTitle.split(year)[0];
      const theTitle2 = theTitle.concat('', titleYear);
      args.jobLog(`Variable theTitle2 = ${theTitle2}`);
      const urlParse = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitle2)}`;
      args.jobLog(`Request URL: ${urlParse}`);
      id = arrApp.delegates.getIdFromParseResponse(
        (await args.deps.axios({
          method: 'get',
          url: urlParse,
          headers: arrApp.headers,
        })),
      );
      args.jobLog(`${arrApp.content} ${id !== -1 ? `'${id}' found` : 'not found'} for '${theTitle2}'`);
    }
  }
  return id;
};

const plugin = async (args: IpluginInputArgs): Promise<IpluginOutputArgs> => {
  const lib = require('../../../../../methods/lib')();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
  args.inputs = lib.loadDefaultValues(args.inputs, details);

  // Variables initialization
  let refreshed = false;
  const arr = String(args.inputs.arr);
  const arr_host = String(args.inputs.arr_host).trim();
  const arrHost = arr_host.endsWith('/') ? arr_host.slice(0, -1) : arr_host;
  const originalFileName = args.originalLibraryFile?._id ?? '';
  const currentFileName = args.inputFileObj?._id ?? '';
  const headers: IHTTPHeaders = {
    'Content-Type': 'application/json',
    'X-Api-Key': String(args.inputs.arr_api_key),
    Accept: 'application/json',
  };
  const arrApp: IArrApp = arr === 'radarr'
    ? {
      name: arr,
      host: arrHost,
      headers,
      content: 'Movie',
      delegates: {
        getIdFromParseResponse:
          (parseResponse: IParseResponse) => Number(parseResponse?.data?.movie?.id ?? -1),
        buildRefreshResquestData:
          (id) => JSON.stringify({ name: 'RefreshMovie', movieIds: [id] }),
      },
    }
    : {
      name: arr,
      host: arrHost,
      headers,
      content: 'Series',
      delegates: {
        getIdFromParseResponse:
          (parseResponse: IParseResponse) => Number(parseResponse?.data?.series?.id ?? -1),
        buildRefreshResquestData:
          (id) => JSON.stringify({ name: 'RefreshSeries', seriesId: id }),
      },
    };

  args.jobLog('Going to force scan');
  args.jobLog(`Refreshing ${arrApp.name}...`);

  let id = await getId(args, arrApp, originalFileName);
  // Useful in some edge cases
  if (id === -1 && currentFileName !== originalFileName) {
    id = await getId(args, arrApp, currentFileName);
  }
  // Checking that the file has been found
  if (id !== -1) {
    // Using command endpoint to queue a refresh task
    await args.deps.axios({
      method: 'post',
      url: `${arrApp.host}/api/v3/command`,
      headers,
      data: arrApp.delegates.buildRefreshResquestData(id),
    });
    refreshed = true;
    args.jobLog(`✔ ${arrApp.content} '${id}' refreshed in ${arrApp.name}.`);
  }
  return {
    outputFileObj: args.inputFileObj,
    outputNumber: refreshed ? 1 : 2,
    variables: args.variables,
  };
};

export {
  details,
  plugin,
};
