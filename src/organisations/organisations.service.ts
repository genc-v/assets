import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organisation,
  OrganisationDocument,
} from './schemas/organisation.schema';

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectModel(Organisation.name)
    private readonly orgModel: Model<OrganisationDocument>,
  ) {}

  async findOrCreate(orgId: string): Promise<OrganisationDocument> {
    const existing = await this.orgModel.findOne({ orgId }).exec();
    if (existing) return existing;
    return this.orgModel.create({ orgId, assets: [] });
  }

  async findByOrgId(orgId: string): Promise<OrganisationDocument | null> {
    return this.orgModel.findOne({ orgId }).exec();
  }
}
