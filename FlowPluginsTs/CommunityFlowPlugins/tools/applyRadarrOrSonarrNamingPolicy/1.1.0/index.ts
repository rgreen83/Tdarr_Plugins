import fileMoveOrCopy from '../../../../FlowHelpers/1.0.0/fileMoveOrCopy';
import {
  getContainer, getFileAbosluteDir, getFileName,
} from '../../../../FlowHelpers/1.0.0/fileUtils';
import {
  IpluginDetails,
  IpluginInputArgs,
  IpluginOutputArgs,
} from '../../../../FlowHelpers/1.0.0/interfaces/interfaces';

const details = (): IpluginDetails => ({
  name: 'Apply Radarr or Sonarr naming policy',
  description: 'Apply Radarr or Sonarr naming policy to a file. '
    + 'This plugin should be called after the original '
    + 'file has been replaced and Radarr or Sonarr has been notified. '
    + 'Radarr or Sonarr should also be notified after this plugin. '
    + 'You can use TMDB, TVDB, or IMDB if following TRaSH Guides '
    + 'naming convention - ID must be in file name, not only folder name. '
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
  icon: 'faPenToSquare',
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
interface IFileInfo {
  id: string,
  seasonNumber?: number,
  episodeNumber?: number
}
interface ILookupResponse {
  data: [{ id: number }],
}
interface IParseResponse {
  data: {
    movie?: { id: number },
    series?: { id: number },
    parsedEpisodeInfo?: {
      episodeNumbers: number[],
      seasonNumber: number
    },
  },
}
interface IFileToRename {
  newPath: string,
  episodeNumbers?: number[]
}
interface IPreviewRenameResponse {
  data: IFileToRename[]
}
interface IArrApp {
  name: string,
  host: string,
  headers: IHTTPHeaders,
  content: string,
  delegates: {
    getFileInfoFromLookupResponse:
    (lookupResponse: ILookupResponse, fileName: string) => IFileInfo,
    getFileInfoFromParseResponse:
    (parseResponse: IParseResponse) => IFileInfo,
    buildPreviewRenameResquestUrl:
    (fileInfo: IFileInfo) => string,
    getFileToRenameFromPreviewRenameResponse:
    (previewRenameResponse: IPreviewRenameResponse, fileInfo: IFileInfo) => IFileToRename | undefined
  }
}

const getFileInfoFromLookup = async (
  args: IpluginInputArgs,
  arrApp: IArrApp,
  fileName: string,
)
  : Promise<IFileInfo> => {
  const idCheck = getFileName(fileName);
  let fInfo: IFileInfo = { id: '-1' };
  if (idCheck.includes('tmdb-')) {
    const tmdbId = fileName.match(/\{tmdb-(\d+)}/)?.at(1) ?? '';
    args.jobLog(`${idCheck} includes tmdb- '${tmdbId}'`);
    const urlTmdb = `${arrApp.host}/api/v3/${arrApp.name === 'radarr' ? 'movie' : 'series'}/lookup?term=tmdb:${tmdbId}`;
    args.jobLog(`Request URL: ${urlTmdb}`);
    if (tmdbId !== '') {
      const lookupResponse: ILookupResponse = await args.deps.axios({
        method: 'get',
        url: urlTmdb,
        headers: arrApp.headers,
      });
      fInfo = arrApp.delegates.getFileInfoFromLookupResponse(lookupResponse, fileName);
      args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'}`
        + ` for tmdb '${tmdbId}'`);
    }
  } else if (idCheck.includes('tvdb-')) {
    const tvdbId = fileName.match(/\{tvdb-(\d+)}/)?.at(1) ?? '';
    args.jobLog(`${idCheck} includes tvdb- '${tvdbId}'`);
    const urlTvdb = `${arrApp.host}/api/v3/${arrApp.name === 'radarr' ? 'movie' : 'series'}/lookup?term=tvdb:${tvdbId}`;
    args.jobLog(`Request URL: ${urlTvdb}`);
    if (tvdbId !== '') {
      const lookupResponse: ILookupResponse = await args.deps.axios({
        method: 'get',
        url: urlTvdb,
        headers: arrApp.headers,
      });
      fInfo = arrApp.delegates.getFileInfoFromLookupResponse(lookupResponse, fileName);
      args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'}`
        + ` for tvdb '${tvdbId}'`);
    }
  } else if (!idCheck.includes('tmdb-') && !idCheck.includes('tvdb-')) {
    const imdbId = /\b(tt|nm|co|ev|ch|ni)\d{7,10}?\b/i.exec(fileName)?.at(0) ?? '';
    args.jobLog(`${idCheck} includes imdb = '${imdbId}'`);
    const urlImdb = `${arrApp.host}/api/v3/${arrApp.name === 'radarr' ? 'movie' : 'series'}/lookup?term=imdb:${imdbId}`;
    args.jobLog(`Request URL: ${urlImdb}`);
    if (imdbId !== '') {
      const lookupResponse: ILookupResponse = await args.deps.axios({
        method: 'get',
        url: urlImdb,
        headers: arrApp.headers,
      });
      fInfo = arrApp.delegates.getFileInfoFromLookupResponse(lookupResponse, fileName);
      args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'}`
        + ` for imdb '${imdbId}'`);
    }
  }
  return fInfo;
};

const getFileInfoFromParse = async (
  args: IpluginInputArgs,
  arrApp: IArrApp,
  fileName: string,
)
  : Promise<IFileInfo> => {
  let fInfo: IFileInfo = { id: '-1' };
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
    const the = 'The';
    const theTitleThe = the.concat(' ', titleThe);
    const theTitleThe2 = theTitleThe.concat('', titleTheYear);
    args.jobLog(`Variable theTitle = ${theTitleThe2}`);
    const urlParseThe = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitleThe2)}`;
    args.jobLog(`Request URL: ${urlParseThe}`);
    const parseResponse: IParseResponse = await args.deps.axios({
      method: 'get',
      url: urlParseThe,
      headers: arrApp.headers,
    });
    fInfo = arrApp.delegates.getFileInfoFromParseResponse(parseResponse);
    args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'} for '${theTitleThe2}'`);
  } else if (anTest === true) {
    // Found titleAn
    const titleAn = theTitle.split(',')[0];
    const titleAnYear = theTitle.split(year)[0];
    // const titleAnRest = theTitle.split(', An')[1];
    const theAn = 'An';
    const theTitleAn = theAn.concat(' ', titleAn);
    const theTitleAn2 = theTitleAn.concat('', titleAnYear);
    args.jobLog(`Variable theTitle = ${theTitleAn2}`);
    const urlParseAn = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitleAn2)}`;
    args.jobLog(`Request URL: ${urlParseAn}`);
    const parseResponse: IParseResponse = await args.deps.axios({
      method: 'get',
      url: urlParseAn,
      headers: arrApp.headers,
    });
    fInfo = arrApp.delegates.getFileInfoFromParseResponse(parseResponse);
    args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'} for '${theTitleAn2}'`);
  } else if (aTest === true) {
    // Found titleAn
    const titleA = theTitle.split(',')[0];
    const titleAYear = theTitle.split(year)[0];
    // const titleARest = theTitle.split(', A')[1];
    const theA = 'A';
    const theTitleA = theA.concat(' ', titleA);
    const theTitleA2 = theTitleA.concat('', titleAYear);
    args.jobLog(`Variable theTitle = ${theTitleA2}`);
    const urlParseA = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitleA2)}`;
    args.jobLog(`Request URL: ${urlParseA}`);
    const parseResponse: IParseResponse = await args.deps.axios({
      method: 'get',
      url: urlParseA,
      headers: arrApp.headers,
    });
    fInfo = arrApp.delegates.getFileInfoFromParseResponse(parseResponse);
    args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'} for '${theTitleA2}'`);
  } else {
    // Default to regular TheTitle naming convention
    args.jobLog(`Variable theTitle = ${theTitle}`);
    const titleYear = theTitle.split(year)[0];
    const theTitle2 = theTitle.concat('', titleYear);
    args.jobLog(`Variable theTitle2 = ${theTitle2}`);
    const urlParse = `${arrApp.host}/api/v3/parse?title=${encodeURIComponent(theTitle2)}`;
    args.jobLog(`Request URL: ${urlParse}`);
    const parseResponse: IParseResponse = await args.deps.axios({
      method: 'get',
      url: urlParse,
      headers: arrApp.headers,
    });
    fInfo = arrApp.delegates.getFileInfoFromParseResponse(parseResponse);
    args.jobLog(`${arrApp.content} ${fInfo.id !== '-1' ? `'${fInfo.id}' found` : 'not found'} for '${theTitle}'`);
  }
  return fInfo;
};

const getFileInfo = async (
  args: IpluginInputArgs,
  arrApp: IArrApp,
  fileName: string,
)
  : Promise<IFileInfo> => {
  const fInfo = await getFileInfoFromLookup(args, arrApp, fileName);
  return (fInfo.id === '-1' || (arrApp.name === 'sonarr' && (fInfo.seasonNumber === -1 || fInfo.episodeNumber === -1)))
    ? getFileInfoFromParse(args, arrApp, fileName)
    : fInfo;
};

const plugin = async (args: IpluginInputArgs): Promise<IpluginOutputArgs> => {
  const lib = require('../../../../../methods/lib')();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
  args.inputs = lib.loadDefaultValues(args.inputs, details);

  let newPath = '';
  let isSuccessful = false;
  const arr = String(args.inputs.arr);
  const arr_host = String(args.inputs.arr_host).trim();
  const arrHost = arr_host.endsWith('/') ? arr_host.slice(0, -1) : arr_host;
  const originalFileName = args.originalLibraryFile?._id ?? '';
  const currentFileName = args.inputFileObj?._id ?? '';
  const headers = {
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
        getFileInfoFromLookupResponse:
          (lookupResponse) => ({ id: String(lookupResponse?.data?.at(0)?.id ?? -1) }),
        getFileInfoFromParseResponse:
          (parseResponse) => ({ id: String(parseResponse?.data?.movie?.id ?? -1) }),
        buildPreviewRenameResquestUrl:
          (fInfo) => `${arrHost}/api/v3/rename?movieId=${fInfo.id}`,
        getFileToRenameFromPreviewRenameResponse:
          (previewRenameResponse) => previewRenameResponse.data?.at(0),
      },
    }
    : {
      name: arr,
      host: arrHost,
      headers,
      content: 'Series',
      delegates: {
        getFileInfoFromLookupResponse:
          (lookupResponse, fileName) => {
            const fInfo: IFileInfo = { id: String(lookupResponse?.data?.at(0)?.id ?? -1) };
            if (fInfo.id !== '-1') {
              const seasonEpisodenumber = /\bS\d{1,3}E\d{1,4}\b/i.exec(fileName)?.at(0) ?? '';
              const episodeNumber = /\d{1,4}$/i.exec(seasonEpisodenumber)?.at(0) ?? '';
              fInfo.seasonNumber = Number(/\d{1,3}/i
                .exec(seasonEpisodenumber.slice(0, -episodeNumber.length))
                ?.at(0) ?? '-1');
              fInfo.episodeNumber = Number(episodeNumber !== '' ? episodeNumber : -1);
            }
            return fInfo;
          },
        getFileInfoFromParseResponse:
          (parseResponse) => ({
            id: String(parseResponse?.data?.series?.id ?? -1),
            seasonNumber: parseResponse?.data?.parsedEpisodeInfo?.seasonNumber ?? 1,
            episodeNumber: parseResponse?.data?.parsedEpisodeInfo?.episodeNumbers?.at(0) ?? 1,
          }),
        buildPreviewRenameResquestUrl:
          (fInfo) => `${arrHost}/api/v3/rename?seriesId=${fInfo.id}&seasonNumber=${fInfo.seasonNumber}`,
        getFileToRenameFromPreviewRenameResponse:
          (previewRenameResponse, fInfo) => previewRenameResponse.data
            ?.find((episodeFile) => episodeFile.episodeNumbers?.at(0) === fInfo.episodeNumber),
      },
    };

  args.jobLog('Going to apply new name');
  args.jobLog(`Renaming via ${arrApp.name}...`);

  // Retrieving movie or series id, plus season and episode number for series
  let fInfo = await getFileInfo(args, arrApp, originalFileName);
  // Useful in some edge cases
  if (fInfo.id === '-1' && currentFileName !== originalFileName) {
    fInfo = await getFileInfo(args, arrApp, currentFileName);
  }

  // Checking that the file has been found
  if (fInfo.id !== '-1') {
    // Using rename endpoint to get ids of all the files that need renaming
    const previewRenameRequestResult = await args.deps.axios({
      method: 'get',
      url: arrApp.delegates.buildPreviewRenameResquestUrl(fInfo),
      headers,
    });
    const fileToRename = arrApp.delegates
      .getFileToRenameFromPreviewRenameResponse(previewRenameRequestResult, fInfo);

    // Only if there is a rename to execute
    if (fileToRename !== undefined) {
      newPath = `${getFileAbosluteDir(currentFileName)
      }/${getFileName(fileToRename.newPath)
      }.${getContainer(fileToRename.newPath)}`;

      isSuccessful = await fileMoveOrCopy({
        operation: 'move',
        sourcePath: currentFileName,
        destinationPath: newPath,
        args,
      });
    } else {
      isSuccessful = true;
      args.jobLog('✔ No rename necessary.');
    }
  }

  return {
    outputFileObj:
      isSuccessful && newPath !== ''
        ? { ...args.inputFileObj, _id: newPath }
        : args.inputFileObj,
    outputNumber: isSuccessful ? 1 : 2,
    variables: args.variables,
  };
};

export {
  details,
  plugin,
};
