import { BadRequestException } from '@nestjs/common';
import { AgentsService } from './agents.service';

describe('agent document review status contract', () => {
  it('accepts APPROVED with a review remark and rejects the obsolete VERIFIED value', async () => {
    const prisma: any = {
      agentDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'document-1', agentId: 'agent-1' }),
        update: jest.fn().mockResolvedValue({ id: 'document-1', status: 'APPROVED', reviewRemark: 'Looks good' }),
      },
    };
    const service = new AgentsService(prisma);
    await expect(service.reviewDocument('agent-1', 'document-1', 'APPROVED', ' Looks good ')).resolves.toEqual(expect.objectContaining({ status: 'APPROVED', reviewRemark: 'Looks good' }));
    expect(prisma.agentDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', reviewRemark: 'Looks good' }) }));
    await expect(service.reviewDocument('agent-1', 'document-1', 'VERIFIED')).rejects.toBeInstanceOf(BadRequestException);
  });
});
