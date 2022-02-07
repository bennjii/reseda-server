import prisma from '../../lib/prisma'

type Usage = {
    id: string,
    userId: string,
    up: string,
    down: string,
    serverId: string,
    connStart: string
}
const log_usage = async (usage_data: Usage) => {
    const result: any = await prisma.usage.create({
        data: {
            ...usage_data
        },
    }).catch(e => {
        console.log(e);

        return {
            error: e,
            reason: "See Error Object",
            data: result
        };
    })
    
    return result ? result : {
        error: "",
        reason: "Usage Logged.",
        data: result
    }  
}

export default log_usage;