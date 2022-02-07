import prisma from '../../lib/prisma'

type Server = {
    id: string,
    location: string,
    country: string,
    virtual: boolean,
    flag: string,
    hostname: string,
}

const register_server = async (server_data: Server, override: boolean) => {
    const server_exists = await prisma.server.findFirst({
        where: {
            OR: [
                {
                    id: server_data.id
                },
                {
                    hostname: server_data.hostname
                }
            ]
        }
    });

    console.log("Verifying...", server_exists);
    
    if(!server_exists) {
        console.log("Creating New Server");

        const result = await prisma.server.create({
            data: server_data,
        }).catch(e => {
            console.log(e);
        })
    
        console.log(result);

        return {
            error: "",
            reason: "Success - Updated",
            data: result
        };
    }else if(override) {
        const result = await prisma.server.update({
            where: {
                id: server_data.id
            },
            data: server_data,
        });
    
        console.log(result);

        return {
            error: "",
            reason: "Success - Overridden",
            data: result
        };
    }else {
        return {
            error: "failure",
            reason: "Server Exists - Pass Override Flag to override existing server.",
            data: {}
        };
    }
}

export default register_server;