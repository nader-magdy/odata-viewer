import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface ODataConnection {
  url: string;
  username: string;
  password: string;
}

export interface ODataResource {
  name: string;
  kind: string;
  url: string;
}

export type CountStrategy = 'count' | 'inlinecount';

export interface ResourceDataRequestOptions {
  skip?: number;
  top?: number;
  includeCount?: boolean;
  countStrategy?: CountStrategy;
  orderBy?: string;
  filter?: string;
}

export interface ResourceDataResult {
  data: any[];
  total: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class ODataService {
  private connection: ODataConnection | null = null;

  constructor(private http: HttpClient) {}

  setConnection(connection: ODataConnection): void {
    this.connection = connection;
  }

  getConnection(): ODataConnection | null {
    return this.connection;
  }

  private getAuthHeaders(extra: Record<string, string | string[]> = {}): HttpHeaders {
    if (!this.connection) {
      throw new Error('No connection configured');
    }

    const credentials = btoa(`${this.connection.username}:${this.connection.password}`);
    return new HttpHeaders({
      'Authorization': `Basic ${credentials}`,
      ...extra
    });
  }

  fetchMetadata(): Observable<string> {
    if (!this.connection) {
      return throwError(() => new Error('No connection configured'));
    }

    const metadataUrl = `${this.connection.url}/$metadata`;
    return this.http.get(metadataUrl, {
      headers: this.getAuthHeaders({ 'Accept': 'application/xml' }),
      responseType: 'text' as const
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        return throwError(() => new Error(`Failed to fetch metadata: ${error.message}`));
      })
    );
  }

  fetchServiceDocument(): Observable<string> {
    if (!this.connection) {
      return throwError(() => new Error('No connection configured'));
    }

    return this.http.get(this.connection.url, {
      headers: this.getAuthHeaders({
        'Accept': 'application/xml,application/json;q=0.9,*/*;q=0.8'
      }),
      responseType: 'text' as const
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        return throwError(() => new Error(`Failed to fetch service document: ${error.message}`));
      })
    );
  }

  parseResourcesFromMetadata(metadataXml: string): ODataResource[] {
    const resources: ODataResource[] = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(metadataXml, 'text/xml');

    // Parse EntitySets
    const entitySets = xmlDoc.getElementsByTagName('EntitySet');
    for (let i = 0; i < entitySets.length; i++) {
      const entitySet = entitySets[i];
      const name = entitySet.getAttribute('Name');
      const entityType = entitySet.getAttribute('EntityType');
      if (name) {
        resources.push({
          name: name,
          kind: 'EntitySet',
          url: `${this.connection?.url}/${name}`
        });
      }
    }

    // Parse EntityTypes
    const entityTypes = xmlDoc.getElementsByTagName('EntityType');
    for (let i = 0; i < entityTypes.length; i++) {
      const entityType = entityTypes[i];
      const name = entityType.getAttribute('Name');
      if (name && !resources.find(r => r.name === name)) {
        resources.push({
          name: name,
          kind: 'EntityType',
          url: `${this.connection?.url}/${name}`
        });
      }
    }

    // Parse FunctionImports
    const functionImports = xmlDoc.getElementsByTagName('FunctionImport');
    for (let i = 0; i < functionImports.length; i++) {
      const functionImport = functionImports[i];
      const name = functionImport.getAttribute('Name');
      if (name) {
        resources.push({
          name: name,
          kind: 'FunctionImport',
          url: `${this.connection?.url}/${name}`
        });
      }
    }

    return resources.sort((a, b) => a.name.localeCompare(b.name));
  }

  parseResourcesFromServiceDocument(serviceDocContent: string): ODataResource[] {
    if (!serviceDocContent) {
      return [];
    }

    // Try JSON payload first
    try {
      const payload = JSON.parse(serviceDocContent);
      if (payload.value && Array.isArray(payload.value)) {
        const jsonResources: ODataResource[] = payload.value
          .filter((item: any) => !!item.name)
          .map((item: any): ODataResource => ({
            name: item.name,
            kind: item.kind || 'Resource',
            url: item.url || `${this.connection?.url}/${item.name}`
          }));

        if (jsonResources.length > 0) {
          return jsonResources.sort((a: ODataResource, b: ODataResource) => a.name.localeCompare(b.name));
        }
      }
    } catch {
      // Not JSON, fall through to XML parsing
    }

    const resources: ODataResource[] = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(serviceDocContent, 'text/xml');

    const collectionNodes = Array.from(xmlDoc.getElementsByTagName('collection'));
    collectionNodes.forEach((collection) => {
      const href = collection.getAttribute('href') || '';
      const atomTitle = collection.getElementsByTagName('atom:title')[0]?.textContent?.trim();
      const title = atomTitle || collection.getElementsByTagName('title')[0]?.textContent?.trim() || href;

      if (title) {
        const normalizedHref = href.replace(/^\//, '');
        resources.push({
          name: title,
          kind: 'EntitySet',
          url: normalizedHref
            ? `${this.connection?.url}/${normalizedHref}`
            : `${this.connection?.url}/${title}`
        });
      }
    });

    const functionImportNodes = Array.from(xmlDoc.getElementsByTagName('function-import'));
    functionImportNodes.forEach((fn) => {
      const name = fn.getAttribute('name') || fn.getAttribute('Title');
      const href = fn.getAttribute('href');
      if (name) {
        const normalizedHref = (href || name).replace(/^\//, '');
        resources.push({
          name,
          kind: 'FunctionImport',
          url: `${this.connection?.url}/${normalizedHref}`
        });
      }
    });

    return resources.sort((a: ODataResource, b: ODataResource) => a.name.localeCompare(b.name));
  }

  getResources(): Observable<ODataResource[]> {
    // Try to get resources from service document first (simpler)
    return this.fetchServiceDocument().pipe(
      map(serviceDocContent => {
        const resources = this.parseResourcesFromServiceDocument(serviceDocContent);
        if (resources.length > 0) {
          return resources;
        }
        // If service document doesn't have resources, try metadata
        throw new Error('No resources found in service document, trying metadata...');
      }),
      catchError(() => {
        // Fallback to metadata parsing
        return this.fetchMetadata().pipe(
          map(metadataXml => this.parseResourcesFromMetadata(metadataXml))
        );
      })
    );
  }

  getResourceData(resourceName: string, options: ResourceDataRequestOptions = {}): Observable<ResourceDataResult> {
    if (!this.connection) {
      return throwError(() => new Error('No connection configured'));
    }

    const normalizedName = resourceName.replace(/^\//, '');
    const baseUrl = `${this.connection.url}/${normalizedName}`;
    const queryParts: string[] = ['$format=json'];
    const countStrategy: CountStrategy = options.countStrategy ?? 'inlinecount';

    if (typeof options.top === 'number' && options.top > 0) {
      queryParts.push(`$top=${options.top}`);
    }

    if (typeof options.skip === 'number' && options.skip > 0) {
      queryParts.push(`$skip=${options.skip}`);
    }

    if (options.includeCount) {
      if (countStrategy === 'inlinecount') {
        queryParts.push(`$inlinecount=allpages`);
      } else {
        queryParts.push(`$count=true`);
      }
    }

    if (options.orderBy) {
      queryParts.push(`$orderby=${encodeURIComponent(options.orderBy)}`);
    }

    if (options.filter) {
      queryParts.push(`$filter=${encodeURIComponent(options.filter)}`);
    }

    const urlWithFormat = queryParts.length > 0
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryParts.join('&')}`
      : baseUrl;

    return this.http.get(urlWithFormat, {
      headers: this.getAuthHeaders({ 'Accept': 'application/json' })
    }).pipe(
      map((response: any) => {
        const data = this.extractDataArray(response);
        const total = this.extractTotalCount(response);
        return {
          data,
          total
        };
      }),
      catchError((error: HttpErrorResponse) => {
        return throwError(() => new Error(`Failed to fetch data for ${resourceName}: ${error.message}`));
      })
    );
  }

  private extractDataArray(response: any): any[] {
    if (response?.value && Array.isArray(response.value)) {
      return response.value;
    }

    if (response?.d?.results && Array.isArray(response.d.results)) {
      return response.d.results;
    }

    if (Array.isArray(response)) {
      return response;
    }

    return response ? [response] : [];
  }

  private extractTotalCount(response: any): number | null {
    if (!response) {
      return null;
    }

    const possibleCounts = [
      response['@odata.count'],
      response['odata.count'],
      response['count'],
      response?.d?.__count
    ];

    for (const candidate of possibleCounts) {
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const parsed = typeof candidate === 'string' ? Number(candidate) : candidate;
      if (typeof parsed === 'number' && !Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return null;
  }
}

