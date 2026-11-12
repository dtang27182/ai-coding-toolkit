export const pageId = (name: string) => `p:${name}`
export const elementId = (page: string, name: string) => `e:${page}/${name}`
export const methodId = (backend: string, name: string) => `m:${backend}.${name}`
export const stateId = (name: string) => `s:${name}`
export const externalId = (url: string) => `x:${url}`
