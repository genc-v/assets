import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { Request } from 'express';
import { AppModule } from './../src/app.module';
import { StorageService } from './../src/storage/storage.service';
import { KafkaService } from './../src/kafka/kafka.service';
import { KafkaConsumerService } from './../src/kafka/kafka-consumer.service';
import { JwtAuthGuard } from './../src/auth/jwt-auth.guard';
import { Readable } from 'stream';

// Mock Services
const mockStorageService = {
  onModuleInit: jest.fn(),
  uploadFile: jest
    .fn()
    .mockImplementation((entryId, userId, buffer, filename) => {
      return Promise.resolve({
        key: `uploads/${entryId}/${filename}`,
        bucket: 'test-bucket',
      });
    }),
  getFileStream: jest.fn().mockImplementation(() => {
    const stream = new Readable();
    stream.push('hello world file content');
    stream.push(null);
    return Promise.resolve(stream);
  }),
};

const mockKafkaService = {
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
  publishFileUploaded: jest.fn().mockResolvedValue(undefined),
};

const mockKafkaConsumerService = {
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
};

// Mock Auth Guard
const mockJwtAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest<Request & { user: any }>();
    req.user = {
      sub: 'test-user-id',
      iss: 'cms',
      aud: 'account',
    };
    return true;
  },
};

describe('FileController (Mocked E2E)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideProvider(KafkaService)
      .useValue(mockKafkaService)
      .overrideProvider(KafkaConsumerService)
      .useValue(mockKafkaConsumerService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/files/upload (POST)', () => {
    it('should upload a file and return file details', async () => {
      const entryId = '123';

      const response = await request(app.getHttpServer() as Server)
        .post('/files/upload')
        .field('entryId', entryId)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(201);

      expect(response.body).toHaveProperty('entryId', entryId);
      expect(response.body).toHaveProperty('assetId');
      expect(response.body).toHaveProperty('url');
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockKafkaService.publishFileUploaded).toHaveBeenCalled();
    });

    it('should fail if no file is provided', () => {
      return request(app.getHttpServer() as Server)
        .post('/files/upload')
        .field('entryId', '123')
        .expect(400);
    });
  });

  describe('/files/:key (GET)', () => {
    it('should retrieve a file stream', async () => {
      const key = 'test-key';

      const response = await request(app.getHttpServer() as Server)
        .get(`/files/${key}`)
        .expect(200);

      expect((response.body as Buffer).toString()).toBe(
        'hello world file content',
      );
      expect(mockStorageService.getFileStream).toHaveBeenCalledWith(key);
    });
  });
});
