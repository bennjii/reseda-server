import prisma from '../../lib/prisma'

type Limits = {
    up: number,
    down: number,
    tier: string
}

const get_user_limit = async (user_id: string): Promise<Limits> => {
    const result: any = await prisma.account.findMany({
        where: {
            userId: user_id
        },
    }).catch(e => {
        console.log(e);

        return {
            error: e,
            reason: "See Error Object",
            data: result
        };
    });

    const limits = {
        up: result[0].maxUp,
        down: result[0].maxDown,
        tier: result[0].tier
    }
    
    return limits;
}

export default get_user_limit;