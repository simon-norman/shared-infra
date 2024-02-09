export const buildResourceName = (region: string, name: string) => {
    return `${region}:${name}`
}

export const buildResourceType = (provider: string, name: string) => {
    return `${provider}:${name}`
}