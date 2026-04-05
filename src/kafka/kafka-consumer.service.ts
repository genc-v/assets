import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
dotenv.config();

interface FileUploadedPayload {
  entryId: string;
  assetId: string;
  key: string;
  originalname: string;
  uploadedAt: string;
}

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private kafka: Kafka;

  async onModuleInit() {
    this.kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    });
    const consumer = this.kafka.consumer({ groupId: 'file-consumers' });
    await consumer.connect();
    await consumer.subscribe({
      topic: process.env.KAFKA_TOPIC || 'files.uploaded',
      fromBeginning: false,
    });
    await consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (!message.value) return;
        try {
          const payload = JSON.parse(
            message.value.toString(),
          ) as FileUploadedPayload;
          console.log(
            'Consumed file event:',
            JSON.stringify(
              {
                entryId: payload?.entryId,
                assetId: payload?.assetId,
                key: payload?.key,
                originalname: payload?.originalname,
                uploadedAt: payload?.uploadedAt,
              },
              null,
              2,
            ),
          );
          await Promise.resolve();
        } catch (err) {
          console.error('Failed to parse Kafka message', err);
        }
      },
    });
  }
}
