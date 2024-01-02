export default () => ({
    endpoints: {
        validation: {
            reserveNames: ['saturn72'],
            namingConventions: [/^.{4,16}$/, /^[a-z0-9-]+$/]
        }
    }
});