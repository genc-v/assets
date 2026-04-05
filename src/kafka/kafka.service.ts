import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import * as dotenv from 'dotenv';
dotenv.config();

export interface FileUploadedEvent {
  entryId: string;
  assetId: string;
  key: string;
  originalname: string;
  uploadedAt: string;
  url: string;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;

  onModuleInit = async () => {
    try {
      this.kafka = new Kafka({
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        connectionTimeout: 5000,
        retry: {
          initialRetryTime: 300,
          retries: 5,
        },
      });
      this.producer = this.kafka.producer();
      await this.producer.connect();
      console.log('Kafka Producer connected');
    } catch (error) {
      console.error('Kafka Connection Error:', error.message);
    }
  };

  onModuleDestroy = async () => {
    if (this.producer) {
      await this.producer.disconnect();
    }
  };

  async publishFileUploaded(event: FileUploadedEvent) {
    if (!this.producer) {
      console.error('Kafka producer not available, skipping message');
      return;
    }
    try {
      await this.producer.send({
        topic: process.env.KAFKA_TOPIC || 'files.uploaded',
        messages: [{ value: JSON.stringify(event) }],
      });
    } catch (error) {
      console.error('Error sending Kafka message:', error.message);
    }
  }
}
